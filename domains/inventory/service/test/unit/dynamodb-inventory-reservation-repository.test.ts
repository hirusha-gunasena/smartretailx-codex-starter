import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';
import {
  DynamoDBInventoryReservationRepository,
  INVENTORY_REJECTION_REASON,
  INVENTORY_RESERVATION_OUTCOME,
} from '../../src/index.js';
import type { ReserveInventoryRequest } from '../../src/index.js';
import {
  CORRELATION_ID,
  EVENT_ID,
  ORDER_ID,
  PROCESSED_AT,
  PRODUCT_ID,
  SECOND_PRODUCT_ID,
  reservationFixture,
} from '../support/fixtures.js';

const INVENTORY_TABLE_NAME = 'InventoryTable';
const RESERVATIONS_TABLE_NAME = 'InventoryReservationsTable';

const requestFixture = (
  overrides: Partial<ReserveInventoryRequest> = {},
): ReserveInventoryRequest => ({
  eventId: EVENT_ID,
  orderId: ORDER_ID,
  correlationId: CORRELATION_ID,
  items: [{ productId: PRODUCT_ID, quantity: 2 }],
  processedAt: PROCESSED_AT,
  ...overrides,
});

const transactionCancellation = (...codes: string[]): TransactionCanceledException =>
  new TransactionCanceledException({
    $metadata: {},
    message: 'The transaction was cancelled',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });

const stockCancellation = (availableQuantity: number): TransactionCanceledException =>
  new TransactionCanceledException({
    $metadata: {},
    message: 'The stock condition was not satisfied',
    CancellationReasons: [
      {
        Code: 'ConditionalCheckFailed',
        Item: { availableQuantity: { N: availableQuantity.toString() } },
      },
      { Code: 'None' },
    ],
  });

const conditionalFailure = (): ConditionalCheckFailedException =>
  new ConditionalCheckFailedException({
    $metadata: {},
    message: 'The condition was not satisfied',
  });

describe('DynamoDBInventoryReservationRepository', () => {
  let send = jest.fn<(command: unknown) => Promise<unknown>>();
  let repository: DynamoDBInventoryReservationRepository;

  beforeEach(() => {
    send = jest.fn<(command: unknown) => Promise<unknown>>();
    repository = new DynamoDBInventoryReservationRepository(
      { send } as unknown as DynamoDBDocumentClient,
      INVENTORY_TABLE_NAME,
      RESERVATIONS_TABLE_NAME,
    );
  });

  test('pre-reads and returns an existing reservation idempotently', async () => {
    const existing = reservationFixture();
    send.mockResolvedValue({ Item: existing });

    await expect(repository.reserve(requestFixture())).resolves.toEqual({
      reservation: existing,
      idempotent: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: RESERVATIONS_TABLE_NAME,
      Key: { eventId: EVENT_ID },
      ConsistentRead: true,
    });
  });

  test('uses one transaction update per distinct product', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const request = requestFixture({
      items: [
        { productId: PRODUCT_ID, quantity: 2 },
        { productId: SECOND_PRODUCT_ID, quantity: 3 },
      ],
    });

    await repository.reserve(request);

    const command = send.mock.calls[1]![0] as TransactWriteCommand;
    expect(command).toBeInstanceOf(TransactWriteCommand);
    const updates = command.input.TransactItems?.filter((item) => item.Update !== undefined);
    expect(updates).toHaveLength(2);
    expect(updates?.map((item) => item.Update?.Key)).toEqual([
      { productId: PRODUCT_ID },
      { productId: SECOND_PRODUCT_ID },
    ]);
  });

  test('places the durable RESERVED outcome in the same transaction', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const result = await repository.reserve(requestFixture());

    const command = send.mock.calls[1]![0] as TransactWriteCommand;
    const put = command.input.TransactItems?.at(-1)?.Put;
    expect(put).toEqual(
      expect.objectContaining({
        TableName: RESERVATIONS_TABLE_NAME,
        ConditionExpression: 'attribute_not_exists(eventId)',
      }),
    );
    expect(put?.Item).toEqual(result.reservation);
    expect(result).toMatchObject({
      reservation: { outcome: INVENTORY_RESERVATION_OUTCOME.RESERVED },
      idempotent: false,
    });
  });

  test('requires the inventory item to exist with sufficient quantity', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await repository.reserve(requestFixture());

    const command = send.mock.calls[1]![0] as TransactWriteCommand;
    const update = command.input.TransactItems?.[0]?.Update;
    expect(update?.ConditionExpression).toBe(
      'attribute_exists(#productId) AND attribute_exists(#availableQuantity) AND #availableQuantity >= :quantity',
    );
    expect(update?.ExpressionAttributeValues).toEqual({
      ':quantity': 2,
      ':updatedAt': PROCESSED_AT,
    });
    expect(update?.ReturnValuesOnConditionCheckFailure).toBe('ALL_OLD');
  });

  test('atomically subtracts quantity and applies one shared stock timestamp', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await repository.reserve(
      requestFixture({
        items: [
          { productId: PRODUCT_ID, quantity: 2 },
          { productId: SECOND_PRODUCT_ID, quantity: 3 },
        ],
      }),
    );

    const command = send.mock.calls[1]![0] as TransactWriteCommand;
    const updates = command.input.TransactItems?.flatMap((item) =>
      item.Update === undefined ? [] : [item.Update],
    );
    expect(updates).toHaveLength(2);
    for (const update of updates ?? []) {
      expect(update.UpdateExpression).toBe(
        'SET #availableQuantity = #availableQuantity - :quantity, #updatedAt = :updatedAt',
      );
      expect(update.ExpressionAttributeValues?.[':updatedAt']).toBe(PROCESSED_AT);
    }
  });

  test('uses the canonical event ID as a stable transaction request token', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await repository.reserve(requestFixture());

    const command = send.mock.calls[1]![0] as TransactWriteCommand;
    expect(command.input.ClientRequestToken).toBe(EVENT_ID);
  });

  test('turns an expected stock condition failure into a durable REJECTED outcome', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(stockCancellation(1))
      .mockResolvedValueOnce({});

    const result = await repository.reserve(requestFixture());

    expect(result.reservation).toMatchObject({
      outcome: INVENTORY_RESERVATION_OUTCOME.REJECTED,
      reason: INVENTORY_REJECTION_REASON.INSUFFICIENT_STOCK,
      insufficientItems: [{ productId: PRODUCT_ID, requestedQuantity: 2, availableQuantity: 1 }],
    });
    expect(result.idempotent).toBe(false);
  });

  test('persists a rejection conditionally without any inventory update', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(transactionCancellation('ConditionalCheckFailed', 'None'))
      .mockResolvedValueOnce({});

    await repository.reserve(requestFixture());

    const rejectionCommand = send.mock.calls[2]![0] as PutCommand;
    expect(rejectionCommand).toBeInstanceOf(PutCommand);
    expect(rejectionCommand.input).toEqual(
      expect.objectContaining({
        TableName: RESERVATIONS_TABLE_NAME,
        ConditionExpression: 'attribute_not_exists(eventId)',
      }),
    );
    expect(rejectionCommand.input.Item).toMatchObject({
      eventId: EVENT_ID,
      outcome: INVENTORY_RESERVATION_OUTCOME.REJECTED,
    });
  });

  test('returns an existing reservation after a transaction idempotency race', async () => {
    const existing = reservationFixture();
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(transactionCancellation('None', 'ConditionalCheckFailed'))
      .mockResolvedValueOnce({ Item: existing });

    await expect(repository.reserve(requestFixture())).resolves.toEqual({
      reservation: existing,
      idempotent: true,
    });
  });

  test('returns an existing reservation after a rejection-write race', async () => {
    const existing = reservationFixture();
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(transactionCancellation('ConditionalCheckFailed', 'None'))
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({ Item: existing });

    await expect(repository.reserve(requestFixture())).resolves.toEqual({
      reservation: existing,
      idempotent: true,
    });
  });

  test('propagates a transaction conflict for SQS retry', async () => {
    const failure = transactionCancellation('TransactionConflict', 'None');
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(failure);

    await expect(repository.reserve(requestFixture())).rejects.toBe(failure);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('propagates transaction throttling for SQS retry', async () => {
    const failure = transactionCancellation('ThrottlingError', 'None');
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(failure);

    await expect(repository.reserve(requestFixture())).rejects.toBe(failure);
  });

  test('does not classify a cancellation without ordered reasons as insufficient stock', async () => {
    const failure = new TransactionCanceledException({
      $metadata: {},
      message: 'The transaction was cancelled',
    });
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(failure);

    await expect(repository.reserve(requestFixture())).rejects.toBe(failure);
  });

  test('does not classify incomplete cancellation reasons as insufficient stock', async () => {
    const failure = transactionCancellation('ConditionalCheckFailed');
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(failure);

    await expect(repository.reserve(requestFixture())).rejects.toBe(failure);
  });

  test('propagates an unexpected AWS error unchanged', async () => {
    const failure = new Error('DynamoDB unavailable');
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(failure);

    await expect(repository.reserve(requestFixture())).rejects.toBe(failure);
  });

  test('rejects a malformed stored reservation', async () => {
    send.mockResolvedValue({ Item: { ...reservationFixture(), eventId: 'corrupted-id' } });

    await expect(repository.reserve(requestFixture())).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
