import { z } from 'zod';
import { currencySchema, orderItemSchema } from './product.js';

export const createOrderBodySchema = z
  .object({
    items: z.array(orderItemSchema).min(1),
    currency: currencySchema,
  })
  .strict();

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
