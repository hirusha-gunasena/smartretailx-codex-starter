import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import { jest } from '@jest/globals';
import { createInventorySqsHandler } from '../../src/index.js';
import type { InventoryReservationResult, OrderCreatedProcessor } from '../../src/index.js';
import {
  eventBridgeEnvelopeFixture,
  eventBridgeMessageBodyFixture,
  rejectedReservationFixture,
  reservationFixture,
  sqsEventFixture,
  sqsRecordFixture,
} from '../support/fixtures.js';

const reservedResult = (idempotent = false): InventoryReservationResult => ({
  reservation: reservationFixture(),
  idempotent,
});

describe('createInventorySqsHandler', () => {
  let execute = jest.fn<(event: OrderCreatedEvent) => Promise<InventoryReservationResult>>();
  let processor: OrderCreatedProcessor;

  beforeEach(() => {
    execute = jest.fn<(event: OrderCreatedEvent) => Promise<InventoryReservationResult>>();
    processor = { execute };
  });

  test('returns no failures for an empty batch', async () => {
    const handler = createInventorySqsHandler(processor);

    await expect(handler(sqsEventFixture([]))).resolves.toEqual({ batchItemFailures: [] });
    expect(execute).not.toHaveBeenCalled();
  });

  test('treats one successful reservation as successful message processing', async () => {
    execute.mockResolvedValue(reservedResult());
    const handler = createInventorySqsHandler(processor);

    await expect(handler(sqsEventFixture([sqsRecordFixture('message-1')]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('treats a durable business rejection as successful message processing', async () => {
    execute.mockResolvedValue({ reservation: rejectedReservationFixture(), idempotent: false });
    const handler = createInventorySqsHandler(processor);

    await expect(handler(sqsEventFixture([sqsRecordFixture('message-1')]))).resolves.toEqual({
      batchItemFailures: [],
    });
  });

  test('treats a duplicate as successful message processing', async () => {
    execute.mockResolvedValue(reservedResult(true));
    const handler = createInventorySqsHandler(processor);

    await expect(handler(sqsEventFixture([sqsRecordFixture('message-1')]))).resolves.toEqual({
      batchItemFailures: [],
    });
  });

  test('processes multiple successful messages', async () => {
    execute.mockResolvedValue(reservedResult());
    const handler = createInventorySqsHandler(processor);

    await expect(
      handler(sqsEventFixture([sqsRecordFixture('message-1'), sqsRecordFixture('message-2')])),
    ).resolves.toEqual({ batchItemFailures: [] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test('returns the SQS message ID for malformed JSON', async () => {
    const handler = createInventorySqsHandler(processor);

    await expect(
      handler(sqsEventFixture([sqsRecordFixture('malformed-message', '{not-json')])),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'malformed-message' }],
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test('returns the SQS message ID for an invalid wrapped event', async () => {
    const invalidEnvelope = {
      ...eventBridgeEnvelopeFixture(),
      source: 'untrusted.order-service',
    };
    const handler = createInventorySqsHandler(processor);

    await expect(
      handler(
        sqsEventFixture([
          sqsRecordFixture('invalid-event-message', JSON.stringify(invalidEnvelope)),
        ]),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'invalid-event-message' }],
    });
  });

  test('returns the SQS message ID for a transient repository failure', async () => {
    execute.mockRejectedValue(new Error('DynamoDB throttled'));
    const handler = createInventorySqsHandler(processor);

    await expect(handler(sqsEventFixture([sqsRecordFixture('message-1')]))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'message-1' }],
    });
  });

  test('returns only failed SQS message IDs in a mixed batch', async () => {
    execute
      .mockResolvedValueOnce(reservedResult())
      .mockRejectedValueOnce(new Error('DynamoDB unavailable'))
      .mockResolvedValueOnce({ reservation: rejectedReservationFixture(), idempotent: false });
    const handler = createInventorySqsHandler(processor);

    await expect(
      handler(
        sqsEventFixture([
          sqsRecordFixture('successful-message'),
          sqsRecordFixture('failed-message'),
          sqsRecordFixture('rejected-message'),
        ]),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'failed-message' }],
    });
  });

  test('never substitutes canonical eventId for the failed SQS messageId', async () => {
    execute.mockRejectedValue(new Error('transient failure'));
    const handler = createInventorySqsHandler(processor);

    const response = await handler(sqsEventFixture([sqsRecordFixture('sqs-message-id')]));

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-message-id' }]);
    expect(response.batchItemFailures[0]?.itemIdentifier).not.toBe(reservationFixture().eventId);
  });

  test('continues processing after an individual record fails', async () => {
    execute.mockResolvedValue(reservedResult());
    const handler = createInventorySqsHandler(processor);

    const response = await handler(
      sqsEventFixture([
        sqsRecordFixture('malformed-message', '{not-json'),
        sqsRecordFixture('valid-message', eventBridgeMessageBodyFixture()),
      ]),
    );

    expect(response).toEqual({
      batchItemFailures: [{ itemIdentifier: 'malformed-message' }],
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
