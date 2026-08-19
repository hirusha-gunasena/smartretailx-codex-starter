import { orderCreatedEventSchema } from '@smartretailx/event-contracts';
import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import type { SQSRecord, SQSEvent } from 'aws-lambda';
import {
  INVENTORY_REJECTION_REASON,
  INVENTORY_RESERVATION_OUTCOME,
  inventoryReservationSchema,
} from '../../src/index.js';
import type { InventoryReservation } from '../../src/index.js';

export const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
export const CORRELATION_ID = '550e8400-e29b-41d4-a716-446655440001';
export const ORDER_ID = '550e8400-e29b-41d4-a716-446655440002';
export const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440003';
export const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440004';
export const SECOND_PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440005';
export const PROCESSED_AT = '2026-08-09T08:30:00.000Z';

export const orderCreatedFixture = (
  overrides: Partial<OrderCreatedEvent> = {},
): OrderCreatedEvent =>
  orderCreatedEventSchema.parse({
    eventId: EVENT_ID,
    eventType: 'OrderCreated',
    eventVersion: '1.0',
    occurredAt: '2026-08-09T08:00:00.000Z',
    source: 'order-service',
    correlationId: CORRELATION_ID,
    data: {
      orderId: ORDER_ID,
      customerId: CUSTOMER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 10 }],
      totalAmount: 20,
      currency: 'USD',
    },
    ...overrides,
  });

export const eventBridgeEnvelopeFixture = (detail: OrderCreatedEvent = orderCreatedFixture()) => ({
  version: '0',
  id: 'eventbridge-delivery-id',
  'detail-type': 'OrderCreated',
  source: 'smartretailx.order-service',
  account: 'test-account',
  time: '2026-08-09T08:00:01.000Z',
  region: 'test-region-1',
  resources: [],
  detail,
});

export const eventBridgeMessageBodyFixture = (
  detail: OrderCreatedEvent = orderCreatedFixture(),
): string => JSON.stringify(eventBridgeEnvelopeFixture(detail));

export const reservationFixture = (
  overrides: Partial<InventoryReservation> = {},
): InventoryReservation =>
  inventoryReservationSchema.parse({
    eventId: EVENT_ID,
    orderId: ORDER_ID,
    correlationId: CORRELATION_ID,
    outcome: INVENTORY_RESERVATION_OUTCOME.RESERVED,
    items: [{ productId: PRODUCT_ID, quantity: 2 }],
    processedAt: PROCESSED_AT,
    ...overrides,
  });

export const rejectedReservationFixture = (): InventoryReservation =>
  inventoryReservationSchema.parse({
    eventId: EVENT_ID,
    orderId: ORDER_ID,
    correlationId: CORRELATION_ID,
    outcome: INVENTORY_RESERVATION_OUTCOME.REJECTED,
    reason: INVENTORY_REJECTION_REASON.INSUFFICIENT_STOCK,
    items: [{ productId: PRODUCT_ID, quantity: 2 }],
    insufficientItems: [{ productId: PRODUCT_ID, requestedQuantity: 2, availableQuantity: 1 }],
    processedAt: PROCESSED_AT,
  });

export const sqsRecordFixture = (
  messageId: string,
  body: string = eventBridgeMessageBodyFixture(),
): SQSRecord => ({
  messageId,
  receiptHandle: `receipt-${messageId}`,
  body,
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1786262400000',
    SenderId: 'test-sender',
    ApproximateFirstReceiveTimestamp: '1786262401000',
  },
  messageAttributes: {},
  md5OfBody: 'test-md5',
  eventSource: 'aws:sqs',
  eventSourceARN: 'test-inventory-queue',
  awsRegion: 'test-region-1',
});

export const sqsEventFixture = (records: readonly SQSRecord[]): SQSEvent => ({
  Records: [...records],
});
