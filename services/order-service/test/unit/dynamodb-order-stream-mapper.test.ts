import { marshall } from '@aws-sdk/util-dynamodb';
import { orderCreatedEventSchema } from '@smartretailx/event-contracts';
import type { AttributeValue } from 'aws-lambda';
import { OrderStreamRecordError, mapOrderStreamRecord } from '../../src/index.js';
import {
  CREATED_AT,
  ORDER_ID,
  SECOND_PRODUCT_ID,
  confirmedOrderFixture,
  orderFixture,
} from '../support/fixtures.js';
import { streamRecordFixture } from '../support/event-fixtures.js';

describe('mapOrderStreamRecord', () => {
  test('maps a valid INSERT into the canonical OrderCreated contract', () => {
    const event = mapOrderStreamRecord(streamRecordFixture());

    expect(orderCreatedEventSchema.parse(event)).toEqual(event);
    expect(event?.eventType).toBe('OrderCreated');
    expect(event?.data).toEqual({
      orderId: ORDER_ID,
      customerId: orderFixture().customerId,
      items: orderFixture().items,
      totalAmount: orderFixture().totalAmount,
      currency: orderFixture().currency,
    });
  });

  test('ignores MODIFY records', () => {
    expect(
      mapOrderStreamRecord(streamRecordFixture(orderFixture(), { eventName: 'MODIFY' })),
    ).toBeNull();
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
          dynamodb: { SequenceNumber: '100000000000000000001' },
        }),
      ),
    ).toThrow(OrderStreamRecordError);
  });

  test('rejects a corrupt NewImage using the canonical Order schema', () => {
    const corruptImage = marshall({ ...orderFixture(), orderId: 'not-a-uuid' }) as Record<
      string,
      AttributeValue
    >;

    expect(() =>
      mapOrderStreamRecord(
        streamRecordFixture(orderFixture(), {
          dynamodb: {
            SequenceNumber: '100000000000000000001',
            NewImage: corruptImage,
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

  test('maps nested order items without losing values', () => {
    const order = orderFixture({
      items: [
        ...orderFixture().items,
        { productId: SECOND_PRODUCT_ID, quantity: 3, unitPrice: 12.5 },
      ],
      totalAmount: 197.48,
    });

    expect(mapOrderStreamRecord(streamRecordFixture(order))?.data.items).toEqual(order.items);
  });

  test('uses event version 1.0', () => {
    expect(mapOrderStreamRecord(streamRecordFixture())?.eventVersion).toBe('1.0');
  });

  test('uses the canonical order-service envelope source', () => {
    expect(mapOrderStreamRecord(streamRecordFixture())?.source).toBe('order-service');
  });

  test('uses orderId as a stable correlationId', () => {
    expect(mapOrderStreamRecord(streamRecordFixture())?.correlationId).toBe(ORDER_ID);
  });

  test('uses order createdAt as the stable occurredAt timestamp', () => {
    expect(mapOrderStreamRecord(streamRecordFixture())?.occurredAt).toBe(CREATED_AT);
  });

  test('produces the same deterministic eventId for repeated mapping', () => {
    const firstEvent = mapOrderStreamRecord(streamRecordFixture());
    const secondEvent = mapOrderStreamRecord(streamRecordFixture());

    expect(firstEvent?.eventId).toBe(secondEvent?.eventId);
    expect(firstEvent?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
