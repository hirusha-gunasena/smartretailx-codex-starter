import type { DynamoDBRecord } from 'aws-lambda';
import { jest } from '@jest/globals';
import {
  UnreportableStreamRecordFailureError,
  createOrderLifecycleRelayHandler,
} from '../../src/index.js';
import type { EventPublisher, OrderLifecycleEvent } from '../../src/index.js';
import {
  SECOND_ORDER_ID,
  confirmedOrderFixture,
  orderFixture,
  rejectedOrderFixture,
} from '../support/fixtures.js';
import {
  modifyStreamRecordFixture,
  streamEventFixture,
  streamRecordFixture,
} from '../support/event-fixtures.js';

const SEQUENCE_ONE = '100000000000000000001';
const SEQUENCE_TWO = '100000000000000000002';
const SEQUENCE_THREE = '100000000000000000003';
const SEQUENCE_FOUR = '100000000000000000004';
const SEQUENCE_FIVE = '100000000000000000005';
const TERMINAL_UPDATED_AT = '2026-08-09T08:45:00.000Z';
const LATER_UPDATED_AT = '2026-08-09T09:00:00.000Z';

const withSequence = (record: DynamoDBRecord, sequenceNumber: string): DynamoDBRecord => ({
  ...record,
  dynamodb: {
    ...record.dynamodb,
    SequenceNumber: sequenceNumber,
  },
});

describe('createOrderLifecycleRelayHandler', () => {
  let publish = jest.fn<(event: OrderLifecycleEvent) => Promise<void>>();
  let publisher: EventPublisher<OrderLifecycleEvent>;

  beforeEach(() => {
    publish = jest.fn<(event: OrderLifecycleEvent) => Promise<void>>();
    publisher = { publish };
  });

  test('returns no failures for an empty batch', async () => {
    const handler = createOrderLifecycleRelayHandler(publisher);

    await expect(handler(streamEventFixture([]))).resolves.toEqual({ batchItemFailures: [] });
  });

  test('publishes one successful INSERT', async () => {
    publish.mockResolvedValue();
    const handler = createOrderLifecycleRelayHandler(publisher);

    await expect(handler(streamEventFixture([streamRecordFixture()]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].eventType).toBe('OrderCreated');
  });

  test('ignores a valid state-preserving MODIFY without reporting a failure', async () => {
    const handler = createOrderLifecycleRelayHandler(publisher);
    const record = modifyStreamRecordFixture(
      orderFixture(),
      orderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
    );

    await expect(handler(streamEventFixture([record]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test('ignores REMOVE without reporting a failure', async () => {
    const handler = createOrderLifecycleRelayHandler(publisher);
    const record = streamRecordFixture(orderFixture(), { eventName: 'REMOVE' });

    await expect(handler(streamEventFixture([record]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test('publishes multiple successful INSERT records', async () => {
    publish.mockResolvedValue();
    const handler = createOrderLifecycleRelayHandler(publisher);
    const records = [
      withSequence(streamRecordFixture(), SEQUENCE_ONE),
      withSequence(streamRecordFixture(orderFixture({ orderId: SECOND_ORDER_ID })), SEQUENCE_TWO),
    ];

    await expect(handler(streamEventFixture(records))).resolves.toEqual({ batchItemFailures: [] });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  test('processes all lifecycle event types, an ignored MODIFY, and REMOVE in one batch', async () => {
    publish.mockResolvedValue();
    const handler = createOrderLifecycleRelayHandler(publisher);
    const records = [
      withSequence(streamRecordFixture(), SEQUENCE_ONE),
      withSequence(
        modifyStreamRecordFixture(
          orderFixture(),
          confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
        ),
        SEQUENCE_TWO,
      ),
      withSequence(
        modifyStreamRecordFixture(
          orderFixture(),
          rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
        ),
        SEQUENCE_THREE,
      ),
      withSequence(
        modifyStreamRecordFixture(orderFixture(), orderFixture({ updatedAt: TERMINAL_UPDATED_AT })),
        SEQUENCE_FOUR,
      ),
      withSequence(streamRecordFixture(orderFixture(), { eventName: 'REMOVE' }), SEQUENCE_FIVE),
    ];

    await expect(handler(streamEventFixture(records))).resolves.toEqual({ batchItemFailures: [] });
    expect(publish.mock.calls.map(([event]) => event.eventType)).toEqual([
      'OrderCreated',
      'OrderConfirmed',
      'OrderRejected',
    ]);
  });

  test('returns only the terminal event whose EventBridge publication failed', async () => {
    publish.mockImplementation(async (event) => {
      if (event.eventType === 'OrderConfirmed') {
        throw new Error('publication failed');
      }
    });
    const handler = createOrderLifecycleRelayHandler(publisher);
    const records = [
      withSequence(streamRecordFixture(), SEQUENCE_ONE),
      withSequence(
        modifyStreamRecordFixture(
          orderFixture(),
          confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
        ),
        SEQUENCE_TWO,
      ),
      withSequence(
        modifyStreamRecordFixture(
          orderFixture(),
          rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
        ),
        SEQUENCE_THREE,
      ),
    ];

    await expect(handler(streamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_TWO }],
    });
    expect(publish).toHaveBeenCalledTimes(3);
  });

  test('reports only an invalid terminal transition and continues with later records', async () => {
    publish.mockResolvedValue();
    const handler = createOrderLifecycleRelayHandler(publisher);
    const invalidTransition = modifyStreamRecordFixture(
      confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      rejectedOrderFixture({ updatedAt: LATER_UPDATED_AT }),
    );
    const records = [
      withSequence(invalidTransition, SEQUENCE_ONE),
      withSequence(streamRecordFixture(), SEQUENCE_TWO),
    ];

    await expect(handler(streamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].eventType).toBe('OrderCreated');
  });

  test('reports only the MODIFY that mutates immutable order data', async () => {
    publish.mockResolvedValue();
    const handler = createOrderLifecycleRelayHandler(publisher);
    const immutableMutation = modifyStreamRecordFixture(
      orderFixture(),
      confirmedOrderFixture({
        customerId: SECOND_ORDER_ID,
        updatedAt: TERMINAL_UPDATED_AT,
      }),
    );
    const validTransition = modifyStreamRecordFixture(
      orderFixture(),
      rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
    );

    await expect(
      handler(
        streamEventFixture([
          withSequence(immutableMutation, SEQUENCE_ONE),
          withSequence(validTransition, SEQUENCE_TWO),
        ]),
      ),
    ).resolves.toEqual({ batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }] });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].eventType).toBe('OrderRejected');
  });

  test('reports multiple mapping failures accurately while excluding a success', async () => {
    publish.mockResolvedValue();
    const handler = createOrderLifecycleRelayHandler(publisher);
    const invalidTransition = modifyStreamRecordFixture(
      rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      confirmedOrderFixture({ updatedAt: LATER_UPDATED_AT }),
    );
    const missingOldImage = modifyStreamRecordFixture(
      orderFixture(),
      confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      {
        dynamodb: {
          SequenceNumber: SEQUENCE_TWO,
          NewImage: withSequence(
            streamRecordFixture(confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT })),
            SEQUENCE_TWO,
          ).dynamodb?.NewImage,
        },
      },
    );

    await expect(
      handler(
        streamEventFixture([
          withSequence(invalidTransition, SEQUENCE_ONE),
          missingOldImage,
          withSequence(streamRecordFixture(), SEQUENCE_THREE),
        ]),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }, { itemIdentifier: SEQUENCE_TWO }],
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test('returns the failed record sequence number', async () => {
    publish.mockRejectedValue(new Error('publication failed'));
    const handler = createOrderLifecycleRelayHandler(publisher);

    await expect(
      handler(streamEventFixture([withSequence(streamRecordFixture(), SEQUENCE_ONE)])),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
  });

  test('does not list successful records as failures', async () => {
    publish.mockRejectedValueOnce(new Error('publication failed')).mockResolvedValueOnce();
    const handler = createOrderLifecycleRelayHandler(publisher);
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
    const handler = createOrderLifecycleRelayHandler(publisher);
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
    const handler = createOrderLifecycleRelayHandler(publisher);

    const response = await handler(
      streamEventFixture([withSequence(streamRecordFixture(), SEQUENCE_ONE)]),
    );

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: SEQUENCE_ONE }]);
  });

  test('reports a malformed INSERT through the partial response', async () => {
    const handler = createOrderLifecycleRelayHandler(publisher);
    const malformedRecord = streamRecordFixture(orderFixture(), {
      dynamodb: { SequenceNumber: SEQUENCE_ONE },
    });

    await expect(handler(streamEventFixture([malformedRecord]))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
  });

  test('continues processing safe records after an individual failure', async () => {
    publish.mockResolvedValue();
    const handler = createOrderLifecycleRelayHandler(publisher);
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
    const handler = createOrderLifecycleRelayHandler(publisher);
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
