import { z } from 'zod';
import { createEventEnvelopeSchema } from './envelope.js';

export const orderRejectedDataSchema = z
  .object({
    orderId: z.string().uuid(),
    reason: z.string().trim().min(1),
  })
  .strict();

export const orderRejectedEventSchema = createEventEnvelopeSchema(
  'OrderRejected',
  'order-service',
  orderRejectedDataSchema,
);

export type OrderRejectedData = z.infer<typeof orderRejectedDataSchema>;
export type OrderRejectedEvent = z.infer<typeof orderRejectedEventSchema>;
