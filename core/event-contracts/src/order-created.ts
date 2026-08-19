import { z } from 'zod';
import { createEventEnvelopeSchema } from './envelope.js';
import { orderLineSchema } from './shared.js';

export const orderCreatedDataSchema = z
  .object({
    orderId: z.string().uuid(),
    customerId: z.string().uuid(),
    items: z.array(orderLineSchema).min(1),
    totalAmount: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code'),
  })
  .strict();

export const orderCreatedEventSchema = createEventEnvelopeSchema(
  'OrderCreated',
  'order-service',
  orderCreatedDataSchema,
);

export type OrderCreatedData = z.infer<typeof orderCreatedDataSchema>;
export type OrderCreatedEvent = z.infer<typeof orderCreatedEventSchema>;
