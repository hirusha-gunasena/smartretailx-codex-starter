import {
  domainEventSchema,
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderRejectedEventSchema,
} from '../src/index.js';

const ids = {
  event: '550e8400-e29b-41d4-a716-446655440000',
  correlation: '550e8400-e29b-41d4-a716-446655440001',
  order: '550e8400-e29b-41d4-a716-446655440002',
  customer: '550e8400-e29b-41d4-a716-446655440003',
  product: '550e8400-e29b-41d4-a716-446655440004',
  reservation: '550e8400-e29b-41d4-a716-446655440005',
} as const;

const envelope = {
  eventId: ids.event,
  eventVersion: '1.0',
  occurredAt: '2026-08-08T10:30:00.000Z',
  correlationId: ids.correlation,
} as const;

const validEvents = [
  {
    ...envelope,
    eventType: 'OrderCreated',
    source: 'order-service',
    data: {
      orderId: ids.order,
      customerId: ids.customer,
      items: [{ productId: ids.product, quantity: 2, unitPrice: 79.99 }],
      totalAmount: 159.98,
      currency: 'USD',
    },
  },
  {
    ...envelope,
    eventType: 'InventoryReserved',
    source: 'inventory-service',
    data: {
      orderId: ids.order,
      reservationId: ids.reservation,
      items: [{ productId: ids.product, quantity: 2 }],
    },
  },
  {
    ...envelope,
    eventType: 'InventoryRejected',
    source: 'inventory-service',
    data: {
      orderId: ids.order,
      reason: 'Insufficient stock',
      items: [{ productId: ids.product, requestedQuantity: 2, availableQuantity: 1 }],
    },
  },
  {
    ...envelope,
    eventType: 'OrderConfirmed',
    source: 'order-service',
    data: {
      orderId: ids.order,
      reservationId: ids.reservation,
    },
  },
  {
    ...envelope,
    eventType: 'OrderRejected',
    source: 'order-service',
    data: {
      orderId: ids.order,
      reason: 'Inventory reservation failed',
    },
  },
] as const;

describe('version 1.0 event contracts', () => {
  test.each(validEvents)('accepts a valid $eventType event', (event) => {
    expect(domainEventSchema.safeParse(event).success).toBe(true);
  });

  test.each([
    ['eventId', { ...validEvents[0], eventId: 'not-a-uuid' }],
    ['correlationId', { ...validEvents[0], correlationId: 'not-a-uuid' }],
    ['orderId', { ...validEvents[0], data: { ...validEvents[0].data, orderId: 'not-a-uuid' } }],
    [
      'productId',
      {
        ...validEvents[0],
        data: {
          ...validEvents[0].data,
          items: [{ ...validEvents[0].data.items[0], productId: 'not-a-uuid' }],
        },
      },
    ],
  ])('rejects an invalid %s UUID', (_field, event) => {
    expect(orderCreatedEventSchema.safeParse(event).success).toBe(false);
  });

  test.each([0, -1, 1.5])('rejects invalid order quantity %s', (quantity) => {
    const event = {
      ...validEvents[0],
      data: {
        ...validEvents[0].data,
        items: [{ ...validEvents[0].data.items[0], quantity }],
      },
    };

    expect(orderCreatedEventSchema.safeParse(event).success).toBe(false);
  });

  test('rejects a non-positive reserved quantity', () => {
    const event = {
      ...validEvents[1],
      data: {
        ...validEvents[1].data,
        items: [{ ...validEvents[1].data.items[0], quantity: 0 }],
      },
    };

    expect(inventoryReservedEventSchema.safeParse(event).success).toBe(false);
  });

  test('rejects a non-positive requested quantity', () => {
    const event = {
      ...validEvents[2],
      data: {
        ...validEvents[2].data,
        items: [{ ...validEvents[2].data.items[0], requestedQuantity: -1 }],
      },
    };

    expect(inventoryRejectedEventSchema.safeParse(event).success).toBe(false);
  });

  test.each([
    [
      'eventId',
      {
        eventType: validEvents[3].eventType,
        eventVersion: validEvents[3].eventVersion,
        occurredAt: validEvents[3].occurredAt,
        source: validEvents[3].source,
        correlationId: validEvents[3].correlationId,
        data: validEvents[3].data,
      },
    ],
    [
      'orderId',
      {
        ...validEvents[4],
        data: { reason: validEvents[4].data.reason },
      },
    ],
    [
      'reason',
      {
        ...validEvents[4],
        data: { orderId: validEvents[4].data.orderId },
      },
    ],
  ])('rejects a missing required %s value', (_field, event) => {
    expect(domainEventSchema.safeParse(event).success).toBe(false);
  });

  test.each(['2.0', 'v1', '', 1])('rejects unknown or incorrect event version %p', (version) => {
    expect(
      domainEventSchema.safeParse({
        ...validEvents[0],
        eventVersion: version,
      }).success,
    ).toBe(false);
  });

  test('rejects a malformed timestamp', () => {
    expect(
      orderConfirmedEventSchema.safeParse({
        ...validEvents[3],
        occurredAt: '08/08/2026 10:30',
      }).success,
    ).toBe(false);
  });

  test('rejects an event with unknown values', () => {
    expect(
      orderRejectedEventSchema.safeParse({
        ...validEvents[4],
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
