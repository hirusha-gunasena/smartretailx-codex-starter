import type { DynamoDBRecord } from 'aws-lambda';
import { jest } from '@jest/globals';
import {
  UnreportableStreamRecordFailureError,
  createInventoryOutcomeRelayHandler,
} from '../../src/index.js';
import type {
  InventoryOutcomeEvent,
  InventoryOutcomeEventPublisher,
  SagaSuccessTelemetryEntry,
  SagaTelemetry,
} from '../../src/index.js';
import {
  SECOND_PRODUCT_ID,
  rejectedReservationFixture,
  reservationFixture,
} from '../support/fixtures.js';
import {
  inventoryOutcomeStreamEventFixture,
  inventoryOutcomeStreamRecordFixture,
} from '../support/inventory-outcome-event-fixtures.js';

const SEQUENCE_ONE = '200000000000000000001';
const SEQUENCE_TWO = '200000000000000000002';
const SECOND_EVENT_ID = '650e8400-e29b-41d4-a716-446655440000';
const SECOND_ORDER_ID = '650e8400-e29b-41d4-a716-446655440001';

const withSequence = (record: DynamoDBRecord, sequenceNumber: string): DynamoDBRecord => ({
  ...record,
  dynamodb: { ...record.dynamodb, SequenceNumber: sequenceNumber },
});

describe('createInventoryOutcomeRelayHandler', () => {
  let publish = jest.fn<(event: InventoryOutcomeEvent) => Promise<void>>();
  let publisher: InventoryOutcomeEventPublisher;

  beforeEach(() => {
    publish = jest.fn<(event: InventoryOutcomeEvent) => Promise<void>>();
    publisher = { publish };
  });

  test('returns no failures for an empty batch', async () => {
    const handler = createInventoryOutcomeRelayHandler(publisher);

    await expect(handler(inventoryOutcomeStreamEventFixture([]))).resolves.toEqual({
      batchItemFailures: [],
    });
  });

  test.each([
    ['InventoryReserved', reservationFixture()],
    ['InventoryRejected', rejectedReservationFixture()],
  ] as const)('publishes one successful %s INSERT', async (eventType, reservation) => {
    publish.mockResolvedValue();
    const recordSuccess = jest.fn<(entry: SagaSuccessTelemetryEntry) => void>();
    const telemetry: SagaTelemetry = { recordSuccess };
    const handler = createInventoryOutcomeRelayHandler(publisher, telemetry);

    await expect(
      handler(
        inventoryOutcomeStreamEventFixture([inventoryOutcomeStreamRecordFixture(reservation)]),
        { awsRequestId: 'inventory-outcome-relay-request-id' },
      ),
    ).resolves.toEqual({ batchItemFailures: [] });
    expect(publish).toHaveBeenCalledTimes(1);
    const publishedEvent = publish.mock.calls[0]![0];
    expect(publishedEvent.eventType).toBe(eventType);
    expect(recordSuccess).toHaveBeenCalledWith({
      event: 'saga.success',
      stage: 'INVENTORY_OUTCOME_RELAY',
      outcome: 'PUBLISHED',
      requestId: 'inventory-outcome-relay-request-id',
      eventId: publishedEvent.eventId,
      eventType: publishedEvent.eventType,
      eventVersion: publishedEvent.eventVersion,
      occurredAt: publishedEvent.occurredAt,
      correlationId: publishedEvent.correlationId,
      orderId: publishedEvent.data.orderId,
    });
  });

  test('does not emit success telemetry when outcome publication fails', async () => {
    publish.mockRejectedValue(new Error('publication failed'));
    const recordSuccess = jest.fn<(entry: SagaSuccessTelemetryEntry) => void>();
    const handler = createInventoryOutcomeRelayHandler(publisher, { recordSuccess });

    await expect(
      handler(
        inventoryOutcomeStreamEventFixture([
          withSequence(inventoryOutcomeStreamRecordFixture(), SEQUENCE_ONE),
        ]),
        { awsRequestId: 'failed-inventory-outcome-relay-request-id' },
      ),
    ).resolves.toEqual({ batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }] });
    expect(recordSuccess).not.toHaveBeenCalled();
  });

  test.each(['MODIFY', 'REMOVE'] as const)(
    'ignores %s without reporting a failure',
    async (eventName) => {
      const handler = createInventoryOutcomeRelayHandler(publisher);
      const record = inventoryOutcomeStreamRecordFixture(reservationFixture(), { eventName });

      await expect(handler(inventoryOutcomeStreamEventFixture([record]))).resolves.toEqual({
        batchItemFailures: [],
      });
      expect(publish).not.toHaveBeenCalled();
    },
  );

  test('publishes a mixed RESERVED and REJECTED batch', async () => {
    publish.mockResolvedValue();
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const records = [
      withSequence(inventoryOutcomeStreamRecordFixture(), SEQUENCE_ONE),
      withSequence(inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()), SEQUENCE_TWO),
    ];

    await expect(handler(inventoryOutcomeStreamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(publish.mock.calls.map(([event]) => event.eventType)).toEqual([
      'InventoryReserved',
      'InventoryRejected',
    ]);
  });

  test('publishes multiple successful INSERT records', async () => {
    publish.mockResolvedValue();
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const secondReservation = reservationFixture({
      eventId: SECOND_EVENT_ID,
      orderId: SECOND_ORDER_ID,
      items: [{ productId: SECOND_PRODUCT_ID, quantity: 1 }],
    });

    await expect(
      handler(
        inventoryOutcomeStreamEventFixture([
          withSequence(inventoryOutcomeStreamRecordFixture(), SEQUENCE_ONE),
          withSequence(inventoryOutcomeStreamRecordFixture(secondReservation), SEQUENCE_TWO),
        ]),
      ),
    ).resolves.toEqual({ batchItemFailures: [] });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  test('turns a malformed record into a batch failure using its sequence number', async () => {
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const malformedRecord = inventoryOutcomeStreamRecordFixture(reservationFixture(), {
      dynamodb: { SequenceNumber: SEQUENCE_ONE },
    });

    await expect(handler(inventoryOutcomeStreamEventFixture([malformedRecord]))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test('turns a publication failure into a batch failure', async () => {
    publish.mockRejectedValue(new Error('publication failed'));
    const handler = createInventoryOutcomeRelayHandler(publisher);

    await expect(
      handler(
        inventoryOutcomeStreamEventFixture([
          withSequence(inventoryOutcomeStreamRecordFixture(), SEQUENCE_ONE),
        ]),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
  });

  test('excludes successful records from failures', async () => {
    publish.mockRejectedValueOnce(new Error('publication failed')).mockResolvedValueOnce();
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const records = [
      withSequence(inventoryOutcomeStreamRecordFixture(), SEQUENCE_ONE),
      withSequence(inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()), SEQUENCE_TWO),
    ];

    await expect(handler(inventoryOutcomeStreamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
  });

  test('returns multiple failed record sequence numbers', async () => {
    publish.mockRejectedValue(new Error('publication failed'));
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const records = [
      withSequence(inventoryOutcomeStreamRecordFixture(), SEQUENCE_ONE),
      withSequence(inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()), SEQUENCE_TWO),
    ];

    await expect(handler(inventoryOutcomeStreamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }, { itemIdentifier: SEQUENCE_TWO }],
    });
  });

  test('continues after one representable malformed-record failure', async () => {
    publish.mockResolvedValue();
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const malformedRecord = inventoryOutcomeStreamRecordFixture(reservationFixture(), {
      dynamodb: { SequenceNumber: SEQUENCE_ONE },
    });
    const validRecord = withSequence(
      inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()),
      SEQUENCE_TWO,
    );

    await expect(
      handler(inventoryOutcomeStreamEventFixture([malformedRecord, validRecord])),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].eventType).toBe('InventoryRejected');
  });

  test('continues after one representable publication failure', async () => {
    publish.mockRejectedValueOnce(new Error('publication failed')).mockResolvedValueOnce();
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const records = [
      withSequence(inventoryOutcomeStreamRecordFixture(), SEQUENCE_ONE),
      withSequence(inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()), SEQUENCE_TWO),
    ];

    await expect(handler(inventoryOutcomeStreamEventFixture(records))).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: SEQUENCE_ONE }],
    });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  test('throws explicitly when a failed record has no sequence number', async () => {
    const handler = createInventoryOutcomeRelayHandler(publisher);
    const malformedRecord = inventoryOutcomeStreamRecordFixture(reservationFixture(), {
      dynamodb: undefined,
    });

    const handling = handler(inventoryOutcomeStreamEventFixture([malformedRecord]));
    await expect(handling).rejects.toBeInstanceOf(UnreportableStreamRecordFailureError);
    await expect(handling).rejects.toMatchObject({
      code: 'UNREPORTABLE_STREAM_RECORD_FAILURE',
      recordIndexes: [0],
    });
  });
});
