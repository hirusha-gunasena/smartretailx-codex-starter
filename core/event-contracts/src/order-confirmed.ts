import { z } from 'zod';
import { createEventEnvelopeSchema } from './envelope.js';

export const orderConfirmedDataSchema = z
  .object({
    orderId: z.string().uuid(),
    reservationId: z.string().uuid(),
  })
  .strict();

export const orderConfirmedEventSchema = createEventEnvelopeSchema(
  'OrderConfirmed',
  'order-service',
  orderConfirmedDataSchema,
);

export type OrderConfirmedData = z.infer<typeof orderConfirmedDataSchema>;
export type OrderConfirmedEvent = z.infer<typeof orderConfirmedEventSchema>;
