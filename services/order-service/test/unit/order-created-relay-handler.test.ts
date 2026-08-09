import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import type { DynamoDBRecord } from 'aws-lambda';
import { jest } from '@jest/globals';
import {
  UnreportableStreamRecordFailureError,
  createOrderCreatedRelayHandler,
} from '../../src/index.js';
import type { EventPublisher } from '../../src/index.js';
import { SECOND_ORDER_ID, orderFixture } from '../support/fixtures.js';
import { streamEventFixture, streamRecordFixture } from '../support/event-fixtures.js';

const SEQUENCE_ONE = '100000000000000000001';
const SEQUENCE_TWO = '100000000000000000002';

const withSequence = (record: DynamoDBRecord, sequenceNumber: string): DynamoDBRecord => ({
  ...record,
  dynamodb: {
    ...record.dynamodb,
    SequenceNumber: sequenceNumber,
  },
});

describe('createOrderCreatedRelayHandler', () => {
  let publish = jest.fn<(event: OrderCreatedEvent) => Promise<void>>();
  let publisher: EventPublisher<OrderCreatedEvent>;

  beforeEach(() => {
    publish = jest.fn<(event: OrderCreatedEvent) => Promise<void>>();
    publisher = { publish };
  });

  test('returns no failures for an empty batch', async () => {
    const handler = createOrderCreatedRelayHandler(publisher);

    await expect(handler(streamEventFixture([]))).resolves.toEqual({ batchItemFailures: [] });
  });

  test('publishes one successful INSERT', async () => {
    publish.mockResolvedValue();
    const handler = createOrderCreatedRelayHandler(publisher);

    await expect(handler(streamEventFixture([streamRecordFixture()]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].eventType).toBe('OrderCreated');
  });

  test('ignores MODIFY without reporting a failure', async () => {
    const handler = createOrderCreatedRelayHandler(publisher);
    const record = streamRecordFixture(orderFixture(), { eventName: 'MODIFY' });

    await expect(handler(streamEventFixture([record]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test('ignores REMOVE without reporting a failure', async () => {
    const handler = createOrderCreatedRelayHandler(publisher);
    const record = streamRecordFixture(orderFixture(), { eventName: 'REMOVE' });

    await expect(handler(streamEventFixture([record]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test('publishes multiple successful INSERT records', async () => {
    publish.mockResolvedValue();
    const handler = createOrderCreatedRelayHandler(publisher);
    const records = [
      withSequence(streamRecordFixture(), SEQUENCE_ONE),
      withSequence(streamRecordFixture(orderFixture({ orderId: SECOND_ORDER_ID })), SEQUENCE_TWO),
    ];

    await expect(handler(streamEventFixture(records))).resolves.toEqual({ batchItemFailures: [] });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  test('returns the failed record sequence number', async () => {
    publish.mockRejectedValue(new Error('publication failed'));
    const handler = createOrderCreatedRelayHandler(publisher);

    await expect(
      handler(streamEventFixture([withSequence(streamRecordFixture(), SEQUENCE_ONE)])),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
  });

  test('does not list successful records as failures', async () => {
    publish.mockRejectedValueOnce(new Error('publication failed')).mockResolvedValueOnce();
    const handler = createOrderCreatedRelayHandler(publisher);
    const records = [
      withSequence(streamRecordFixture(), SEQUENCE_ONE),
      withSequence(streamRecordFixture(orderFixture({ orderId: SECOND_ORDER_ID })), SEQUENCE_TWO),
    ];

    await expect(handler(streamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
  });

  test('returns multiple failed sequence numbers', async () => {
    publish.mockRejectedValue(new Error('publication failed'));
    const handler = createOrderCreatedRelayHandler(publisher);
    const records = [
      withSequence(streamRecordFixture(), SEQUENCE_ONE),
      withSequence(streamRecordFixture(orderFixture({ orderId: SECOND_ORDER_ID })), SEQUENCE_TWO),
    ];

    await expect(handler(streamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }, { itemIdentifier: SEQUENCE_TWO }],
    });
  });

  test('reports an EventBridge publication failure through the partial response', async () => {
    publish.mockRejectedValue(new Error('EventBridge entry rejected'));
    const handler = createOrderCreatedRelayHandler(publisher);

    const response = await handler(
      streamEventFixture([withSequence(streamRecordFixture(), SEQUENCE_ONE)]),
    );

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: SEQUENCE_ONE }]);
  });

  test('reports a malformed INSERT through the partial response', async () => {
    const handler = createOrderCreatedRelayHandler(publisher);
    const malformedRecord = streamRecordFixture(orderFixture(), {
      dynamodb: { SequenceNumber: SEQUENCE_ONE },
    });

    await expect(handler(streamEventFixture([malformedRecord]))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
  });

  test('continues processing safe records after an individual failure', async () => {
    publish.mockResolvedValue();
    const handler = createOrderCreatedRelayHandler(publisher);
    const malformedRecord = streamRecordFixture(orderFixture(), {
      dynamodb: { SequenceNumber: SEQUENCE_ONE },
    });
    const validRecord = withSequence(
      streamRecordFixture(orderFixture({ orderId: SECOND_ORDER_ID })),
      SEQUENCE_TWO,
    );

    await expect(handler(streamEventFixture([malformedRecord, validRecord]))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].data.orderId).toBe(SECOND_ORDER_ID);
  });

  test('throws explicitly when a failed record has no sequence number', async () => {
    const handler = createOrderCreatedRelayHandler(publisher);
    const malformedRecord = streamRecordFixture(orderFixture(), { dynamodb: undefined });

    await expect(handler(streamEventFixture([malformedRecord]))).rejects.toMatchObject({
      code: 'UNREPORTABLE_STREAM_RECORD_FAILURE',
      recordIndexes: [0],
    });
    await expect(handler(streamEventFixture([malformedRecord]))).rejects.toBeInstanceOf(
      UnreportableStreamRecordFailureError,
    );
  });
});
