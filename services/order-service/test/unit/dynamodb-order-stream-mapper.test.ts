import { marshall } from '@aws-sdk/util-dynamodb';
import {
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderRejectedEventSchema,
} from '@smartretailx/event-contracts';
import type { AttributeValue } from 'aws-lambda';
import {
  OrderLifecycleTransitionError,
  OrderStreamRecordError,
  createOrderConfirmedEventId,
  createOrderCreatedEventId,
  createOrderRejectedEventId,
  mapOrderStreamRecord,
} from '../../src/index.js';
import {
  CREATED_AT,
  ORDER_ID,
  REJECTION_REASON,
  RESERVATION_ID,
  SECOND_ORDER_ID,
  SECOND_PRODUCT_ID,
  confirmedOrderFixture,
  orderFixture,
  rejectedOrderFixture,
} from '../support/fixtures.js';
import { modifyStreamRecordFixture, streamRecordFixture } from '../support/event-fixtures.js';

const TERMINAL_UPDATED_AT = '2026-08-09T08:45:00.000Z';
const LATER_UPDATED_AT = '2026-08-09T09:00:00.000Z';
const SEQUENCE_NUMBER = '100000000000000000001';

const attributeImage = (value: object): Record<string, AttributeValue> =>
  marshall(value) as Record<string, AttributeValue>;

describe('mapOrderStreamRecord', () => {
  test('maps a valid PENDING INSERT into the unchanged canonical OrderCreated contract', () => {
    const event = mapOrderStreamRecord(streamRecordFixture());

    expect(orderCreatedEventSchema.parse(event)).toEqual(event);
    expect(event).toMatchObject({
      eventId: 'fd8f6920-308f-5902-9927-0ae291a38076',
      eventType: 'OrderCreated',
      eventVersion: '1.0',
      occurredAt: CREATED_AT,
      source: 'order-service',
      correlationId: ORDER_ID,
      data: {
        orderId: ORDER_ID,
        customerId: orderFixture().customerId,
        items: orderFixture().items,
        totalAmount: orderFixture().totalAmount,
        currency: orderFixture().currency,
      },
    });
  });

  test('maps PENDING to CONFIRMED into canonical OrderConfirmed using durable metadata', () => {
    const newOrder = confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT });
    const event = mapOrderStreamRecord(modifyStreamRecordFixture(orderFixture(), newOrder));

    expect(orderConfirmedEventSchema.parse(event)).toEqual(event);
    expect(event).toMatchObject({
      eventType: 'OrderConfirmed',
      eventVersion: '1.0',
      occurredAt: TERMINAL_UPDATED_AT,
      source: 'order-service',
      correlationId: ORDER_ID,
      data: { orderId: ORDER_ID, reservationId: RESERVATION_ID },
    });
  });

  test('maps PENDING to REJECTED into canonical OrderRejected using the exact durable reason', () => {
    const newOrder = rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT });
    const event = mapOrderStreamRecord(modifyStreamRecordFixture(orderFixture(), newOrder));

    expect(orderRejectedEventSchema.parse(event)).toEqual(event);
    expect(event).toMatchObject({
      eventType: 'OrderRejected',
      eventVersion: '1.0',
      occurredAt: TERMINAL_UPDATED_AT,
      source: 'order-service',
      correlationId: ORDER_ID,
      data: { orderId: ORDER_ID, reason: REJECTION_REASON },
    });
  });

  test('creates stable and distinct deterministic IDs for every lifecycle event type', () => {
    const confirmedRecord = modifyStreamRecordFixture(
      orderFixture(),
      confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
    );
    const rejectedRecord = modifyStreamRecordFixture(
      orderFixture(),
      rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
    );
    const firstConfirmed = mapOrderStreamRecord(confirmedRecord);
    const secondConfirmed = mapOrderStreamRecord(confirmedRecord);
    const firstRejected = mapOrderStreamRecord(rejectedRecord);
    const secondRejected = mapOrderStreamRecord(rejectedRecord);

    expect(firstConfirmed?.eventId).toBe(secondConfirmed?.eventId);
    expect(firstRejected?.eventId).toBe(secondRejected?.eventId);
    expect(firstConfirmed?.eventId).toBe(createOrderConfirmedEventId(ORDER_ID));
    expect(firstRejected?.eventId).toBe(createOrderRejectedEventId(ORDER_ID));
    expect(
      new Set([
        createOrderCreatedEventId(ORDER_ID),
        createOrderConfirmedEventId(ORDER_ID),
        createOrderRejectedEventId(ORDER_ID),
      ]).size,
    ).toBe(3);
    expect(firstConfirmed?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(firstRejected?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  test.each([
    ['PENDING to PENDING', orderFixture(), orderFixture({ updatedAt: TERMINAL_UPDATED_AT })],
    [
      'CONFIRMED to CONFIRMED',
      confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      confirmedOrderFixture({ updatedAt: LATER_UPDATED_AT }),
    ],
    [
      'REJECTED to REJECTED',
      rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      rejectedOrderFixture({ updatedAt: LATER_UPDATED_AT }),
    ],
  ])('ignores a valid state-preserving %s MODIFY', (_name, oldOrder, newOrder) => {
    expect(mapOrderStreamRecord(modifyStreamRecordFixture(oldOrder, newOrder))).toBeNull();
  });

  test('rejects a state-preserving CONFIRMED write that changes reservationId', () => {
    const oldOrder = confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT });
    const newOrder = confirmedOrderFixture({
      reservationId: SECOND_ORDER_ID,
      updatedAt: LATER_UPDATED_AT,
    });

    expect(() => mapOrderStreamRecord(modifyStreamRecordFixture(oldOrder, newOrder))).toThrow(
      OrderLifecycleTransitionError,
    );
  });

  test('rejects a state-preserving REJECTED write that changes rejectionReason', () => {
    const oldOrder = rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT });
    const newOrder = rejectedOrderFixture({
      rejectionReason: 'PRODUCT_NOT_FOUND',
      updatedAt: LATER_UPDATED_AT,
    });

    expect(() => mapOrderStreamRecord(modifyStreamRecordFixture(oldOrder, newOrder))).toThrow(
      OrderLifecycleTransitionError,
    );
  });

  test.each([
    [
      'CONFIRMED to REJECTED',
      confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      rejectedOrderFixture({ updatedAt: LATER_UPDATED_AT }),
    ],
    [
      'REJECTED to CONFIRMED',
      rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      confirmedOrderFixture({ updatedAt: LATER_UPDATED_AT }),
    ],
    [
      'CONFIRMED to PENDING',
      confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      orderFixture({ updatedAt: LATER_UPDATED_AT }),
    ],
    [
      'REJECTED to PENDING',
      rejectedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      orderFixture({ updatedAt: LATER_UPDATED_AT }),
    ],
  ])('rejects invalid lifecycle transition %s', (_name, oldOrder, newOrder) => {
    expect(() => mapOrderStreamRecord(modifyStreamRecordFixture(oldOrder, newOrder))).toThrow(
      OrderLifecycleTransitionError,
    );
  });

  test('rejects a MODIFY without OldImage', () => {
    expect(() =>
      mapOrderStreamRecord(
        modifyStreamRecordFixture(
          orderFixture(),
          confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
          {
            dynamodb: {
              SequenceNumber: SEQUENCE_NUMBER,
              NewImage: attributeImage(confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT })),
            },
          },
        ),
      ),
    ).toThrow(OrderStreamRecordError);
  });

  test('rejects a MODIFY without NewImage', () => {
    expect(() =>
      mapOrderStreamRecord(
        modifyStreamRecordFixture(
          orderFixture(),
          confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
          {
            dynamodb: {
              SequenceNumber: SEQUENCE_NUMBER,
              OldImage: attributeImage(orderFixture()),
            },
          },
        ),
      ),
    ).toThrow(OrderStreamRecordError);
  });

  test('rejects a malformed MODIFY OldImage through canonical Order validation', () => {
    const newOrder = confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT });
    const record = modifyStreamRecordFixture(orderFixture(), newOrder, {
      dynamodb: {
        SequenceNumber: SEQUENCE_NUMBER,
        OldImage: attributeImage({ ...orderFixture(), orderId: 'not-a-uuid' }),
        NewImage: attributeImage(newOrder),
      },
    });

    expect(() => mapOrderStreamRecord(record)).toThrow();
  });

  test('rejects a malformed MODIFY NewImage through canonical Order validation', () => {
    const record = modifyStreamRecordFixture(
      orderFixture(),
      confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
      {
        dynamodb: {
          SequenceNumber: SEQUENCE_NUMBER,
          OldImage: attributeImage(orderFixture()),
          NewImage: attributeImage({
            ...confirmedOrderFixture({ updatedAt: TERMINAL_UPDATED_AT }),
            reservationId: 'not-a-uuid',
          }),
        },
      },
    );

    expect(() => mapOrderStreamRecord(record)).toThrow();
  });

  test('rejects a MODIFY whose images have different order IDs', () => {
    expect(() =>
      mapOrderStreamRecord(
        modifyStreamRecordFixture(
          orderFixture(),
          confirmedOrderFixture({ orderId: SECOND_ORDER_ID, updatedAt: TERMINAL_UPDATED_AT }),
        ),
      ),
    ).toThrow(OrderLifecycleTransitionError);
  });

  test.each([
    ['customerId', { customerId: SECOND_ORDER_ID }],
    ['items', { items: [{ productId: SECOND_PRODUCT_ID, quantity: 2, unitPrice: 79.99 }] }],
    ['totalAmount', { totalAmount: 160 }],
    ['currency', { currency: 'LKR' }],
    ['createdAt', { createdAt: '2026-08-09T08:31:00.000Z' }],
  ])('rejects an immutable %s mutation', (_field, mutation) => {
    const newOrder = confirmedOrderFixture({ ...mutation, updatedAt: TERMINAL_UPDATED_AT });

    expect(() => mapOrderStreamRecord(modifyStreamRecordFixture(orderFixture(), newOrder))).toThrow(
      OrderLifecycleTransitionError,
    );
  });

  test('rejects updatedAt regression relative to the old image', () => {
    const oldOrder = orderFixture({ updatedAt: TERMINAL_UPDATED_AT });
    const newOrder = orderFixture({ updatedAt: '2026-08-09T08:40:00.000Z' });

    expect(() => mapOrderStreamRecord(modifyStreamRecordFixture(oldOrder, newOrder))).toThrow(
      OrderLifecycleTransitionError,
    );
  });

  test('rejects updatedAt earlier than the durable createdAt', () => {
    const oldOrder = orderFixture({ updatedAt: '2026-08-09T08:20:00.000Z' });
    const newOrder = orderFixture({ updatedAt: '2026-08-09T08:25:00.000Z' });

    expect(() => mapOrderStreamRecord(modifyStreamRecordFixture(oldOrder, newOrder))).toThrow(
      OrderLifecycleTransitionError,
    );
  });

  test('ignores REMOVE records', () => {
    expect(
      mapOrderStreamRecord(streamRecordFixture(orderFixture(), { eventName: 'REMOVE' })),
    ).toBeNull();
  });

  test('rejects an INSERT without NewImage', () => {
    expect(() =>
      mapOrderStreamRecord(
        streamRecordFixture(orderFixture(), {
          dynamodb: { SequenceNumber: SEQUENCE_NUMBER },
        }),
      ),
    ).toThrow(OrderStreamRecordError);
  });

  test('rejects a corrupt INSERT NewImage using the canonical Order schema', () => {
    expect(() =>
      mapOrderStreamRecord(
        streamRecordFixture(orderFixture(), {
          dynamodb: {
            SequenceNumber: SEQUENCE_NUMBER,
            NewImage: attributeImage({ ...orderFixture(), orderId: 'not-a-uuid' }),
          },
        }),
      ),
    ).toThrow();
  });

  test('rejects a newly inserted order whose status is not PENDING', () => {
    expect(() => mapOrderStreamRecord(streamRecordFixture(confirmedOrderFixture()))).toThrow(
      OrderStreamRecordError,
    );
  });

  test('maps nested OrderCreated items without losing values', () => {
    const order = orderFixture({
      items: [
        ...orderFixture().items,
        { productId: SECOND_PRODUCT_ID, quantity: 3, unitPrice: 12.5 },
      ],
      totalAmount: 197.48,
    });
    const event = mapOrderStreamRecord(streamRecordFixture(order));

    expect(event?.eventType).toBe('OrderCreated');
    if (event?.eventType === 'OrderCreated') {
      expect(event.data.items).toEqual(order.items);
    }
  });
});
