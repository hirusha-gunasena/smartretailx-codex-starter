import {
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
} from '@smartretailx/event-contracts';
import type { InventoryRejectedEvent, InventoryReservedEvent } from '@smartretailx/event-contracts';
import type { SQSRecord, SQSEvent } from 'aws-lambda';
import { ORDER_ID, PRODUCT_ID } from './fixtures.js';

export const INVENTORY_RESERVED_EVENT_ID = '550e8400-e29b-41d4-a716-446655440020';
export const INVENTORY_REJECTED_EVENT_ID = '550e8400-e29b-41d4-a716-446655440021';
export const RESERVATION_ID = '550e8400-e29b-41d4-a716-446655440022';
export const OUTCOME_OCCURRED_AT = '2026-08-09T08:45:00.000Z';

export const inventoryReservedFixture = (
  overrides: Partial<InventoryReservedEvent> = {},
): InventoryReservedEvent =>
  inventoryReservedEventSchema.parse({
    eventId: INVENTORY_RESERVED_EVENT_ID,
    eventType: 'InventoryReserved',
    eventVersion: '1.0',
    occurredAt: OUTCOME_OCCURRED_AT,
    source: 'inventory-service',
    correlationId: ORDER_ID,
    data: {
      orderId: ORDER_ID,
      reservationId: RESERVATION_ID,
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    },
    ...overrides,
  });

export const inventoryRejectedFixture = (
  overrides: Partial<InventoryRejectedEvent> = {},
): InventoryRejectedEvent =>
  inventoryRejectedEventSchema.parse({
    eventId: INVENTORY_REJECTED_EVENT_ID,
    eventType: 'InventoryRejected',
    eventVersion: '1.0',
    occurredAt: OUTCOME_OCCURRED_AT,
    source: 'inventory-service',
    correlationId: ORDER_ID,
    data: {
      orderId: ORDER_ID,
      reason: 'INSUFFICIENT_STOCK',
      items: [{ productId: PRODUCT_ID, requestedQuantity: 2, availableQuantity: 1 }],
    },
    ...overrides,
  });

export type InventoryOutcomeFixture = InventoryReservedEvent | InventoryRejectedEvent;

export const inventoryOutcomeEnvelopeFixture = (
  detail: InventoryOutcomeFixture = inventoryReservedFixture(),
) => ({
  version: '0',
  id: 'eventbridge-delivery-id',
  'detail-type': detail.eventType,
  source: 'smartretailx.inventory-service',
  account: 'test-account',
  time: '2026-08-09T08:45:01.000Z',
  region: 'test-region-1',
  resources: [],
  detail,
});

export const inventoryOutcomeMessageBodyFixture = (
  detail: InventoryOutcomeFixture = inventoryReservedFixture(),
): string => JSON.stringify(inventoryOutcomeEnvelopeFixture(detail));

export const orderWorkflowSqsRecordFixture = (
  messageId: string,
  body: string = inventoryOutcomeMessageBodyFixture(),
): SQSRecord => ({
  messageId,
  receiptHandle: `receipt-${messageId}`,
  body,
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1786265100000',
    SenderId: 'test-sender',
    ApproximateFirstReceiveTimestamp: '1786265101000',
  },
  messageAttributes: {},
  md5OfBody: 'test-md5',
  eventSource: 'aws:sqs',
  eventSourceARN: 'test-order-workflow-queue',
  awsRegion: 'test-region-1',
});

export const orderWorkflowSqsEventFixture = (records: readonly SQSRecord[]): SQSEvent => ({
  Records: [...records],
});
