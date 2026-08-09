import { orderCreatedEventSchema } from '@smartretailx/event-contracts';
import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import { z } from 'zod';

export const ORDER_CREATED_EVENTBRIDGE_SOURCE = 'smartretailx.order-service' as const;

export const eventBridgeOrderCreatedEnvelopeSchema = z
  .object({
    version: z.literal('0'),
    id: z.string().trim().min(1),
    'detail-type': z.literal('OrderCreated'),
    source: z.literal(ORDER_CREATED_EVENTBRIDGE_SOURCE),
    account: z.string().trim().min(1),
    time: z.string().datetime({ offset: true }),
    region: z.string().trim().min(1),
    resources: z.array(z.string()),
    detail: orderCreatedEventSchema,
  })
  .passthrough();

export const parseOrderCreatedMessage = (body: string): OrderCreatedEvent => {
  const decoded: unknown = JSON.parse(body);
  return eventBridgeOrderCreatedEnvelopeSchema.parse(decoded).detail;
};
