import { marshall } from '@aws-sdk/util-dynamodb';
import {
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
} from '@smartretailx/event-contracts';
import type { AttributeValue } from 'aws-lambda';
import {
  INVENTORY_OUTCOME_EVENT_TYPE,
  InventoryOutcomeStreamRecordError,
  mapInventoryOutcomeStreamRecord,
} from '../../src/index.js';
import {
  CORRELATION_ID,
  EVENT_ID,
  ORDER_ID,
  PROCESSED_AT,
  PRODUCT_ID,
  SECOND_PRODUCT_ID,
  rejectedReservationFixture,
  reservationFixture,
} from '../support/fixtures.js';
import { inventoryOutcomeStreamRecordFixture } from '../support/inventory-outcome-event-fixtures.js';

describe('mapInventoryOutcomeStreamRecord', () => {
  test('maps a valid RESERVED INSERT into canonical InventoryReserved', () => {
    const event = mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture());

    expect(inventoryReservedEventSchema.parse(event)).toEqual(event);
    expect(event?.eventType).toBe('InventoryReserved');
    expect(event?.data).toEqual({
      orderId: ORDER_ID,
      reservationId: EVENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    });
  });

  test('maps a valid REJECTED INSERT into canonical InventoryRejected', () => {
    const event = mapInventoryOutcomeStreamRecord(
      inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()),
    );

    expect(inventoryRejectedEventSchema.parse(event)).toEqual(event);
    expect(event?.eventType).toBe('InventoryRejected');
    expect(event?.data).toEqual({
      orderId: ORDER_ID,
      reason: 'INSUFFICIENT_STOCK',
      items: [{ productId: PRODUCT_ID, requestedQuantity: 2, availableQuantity: 1 }],
    });
  });

  test.each(['MODIFY', 'REMOVE'] as const)('ignores %s records', (eventName) => {
    expect(
      mapInventoryOutcomeStreamRecord(
        inventoryOutcomeStreamRecordFixture(reservationFixture(), { eventName }),
      ),
    ).toBeNull();
  });

  test('rejects an INSERT without NewImage', () => {
    expect(() =>
      mapInventoryOutcomeStreamRecord(
        inventoryOutcomeStreamRecordFixture(reservationFixture(), {
          dynamodb: { SequenceNumber: '200000000000000000001' },
        }),
      ),
    ).toThrow(InventoryOutcomeStreamRecordError);
  });

  test('rejects a malformed DynamoDB NewImage', () => {
    const malformedImage = {
      eventId: { unsupportedAttributeValue: true },
    } as unknown as Record<string, AttributeValue>;

    expect(() =>
      mapInventoryOutcomeStreamRecord(
        inventoryOutcomeStreamRecordFixture(reservationFixture(), {
          dynamodb: {
            SequenceNumber: '200000000000000000001',
            NewImage: malformedImage,
          },
        }),
      ),
    ).toThrow();
  });

  test('rejects an unmarshalled value that is not a valid durable reservation', () => {
    const invalidReservation = marshall({
      ...reservationFixture(),
      eventId: 'not-a-uuid',
    }) as Record<string, AttributeValue>;

    expect(() =>
      mapInventoryOutcomeStreamRecord(
        inventoryOutcomeStreamRecordFixture(reservationFixture(), {
          dynamodb: {
            SequenceNumber: '200000000000000000001',
            NewImage: invalidReservation,
          },
        }),
      ),
    ).toThrow();
  });

  test('maps all RESERVED items and quantities without querying another store', () => {
    const reservation = reservationFixture({
      items: [
        { productId: PRODUCT_ID, quantity: 2 },
        { productId: SECOND_PRODUCT_ID, quantity: 4 },
      ],
    });

    const event = mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture(reservation));

    expect(event?.data.items).toEqual(reservation.items);
  });

  test('maps the machine-readable rejection reason and insufficient items', () => {
    const reservation = rejectedReservationFixture();
    if (reservation.outcome !== 'REJECTED') {
      throw new Error('Expected the rejected reservation fixture to be REJECTED.');
    }
    const event = mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture(reservation));

    expect(event?.eventType).toBe('InventoryRejected');
    if (event?.eventType === 'InventoryRejected') {
      expect(event.data.reason).toBe(reservation.reason);
      expect(event.data.items).toEqual(reservation.insufficientItems);
    }
  });

  test.each([reservationFixture(), rejectedReservationFixture()])(
    'uses canonical event version 1.0',
    (reservation) => {
      expect(
        mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture(reservation))
          ?.eventVersion,
      ).toBe('1.0');
    },
  );

  test.each([reservationFixture(), rejectedReservationFixture()])(
    'uses the canonical inventory-service source',
    (reservation) => {
      expect(
        mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture(reservation))?.source,
      ).toBe('inventory-service');
    },
  );

  test.each([reservationFixture(), rejectedReservationFixture()])(
    'preserves the workflow correlationId',
    (reservation) => {
      expect(
        mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture(reservation))
          ?.correlationId,
      ).toBe(CORRELATION_ID);
    },
  );

  test.each([reservationFixture(), rejectedReservationFixture()])(
    'uses processedAt as a stable occurredAt',
    (reservation) => {
      expect(
        mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture(reservation))
          ?.occurredAt,
      ).toBe(PROCESSED_AT);
    },
  );

  test.each([
    [INVENTORY_OUTCOME_EVENT_TYPE.RESERVED, reservationFixture()],
    [INVENTORY_OUTCOME_EVENT_TYPE.REJECTED, rejectedReservationFixture()],
  ] as const)('creates a deterministic UUID v5 for %s', (_eventType, reservation) => {
    const firstEvent = mapInventoryOutcomeStreamRecord(
      inventoryOutcomeStreamRecordFixture(reservation),
    );
    const secondEvent = mapInventoryOutcomeStreamRecord(
      inventoryOutcomeStreamRecordFixture(reservation),
    );

    expect(firstEvent?.eventId).toBe(secondEvent?.eventId);
    expect(firstEvent?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  test('keeps RESERVED and REJECTED IDs distinct for the same durable identity', () => {
    const reservedEvent = mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture());
    const rejectedEvent = mapInventoryOutcomeStreamRecord(
      inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()),
    );

    expect(reservedEvent?.eventId).not.toBe(rejectedEvent?.eventId);
  });

  test('rejects an unsupported or missing stream event name', () => {
    expect(() =>
      mapInventoryOutcomeStreamRecord(
        inventoryOutcomeStreamRecordFixture(reservationFixture(), { eventName: undefined }),
      ),
    ).toThrow(InventoryOutcomeStreamRecordError);
  });
});
