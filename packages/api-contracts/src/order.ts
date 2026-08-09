import { z } from 'zod';
import { currencySchema, orderItemSchema, timestampSchema } from './product.js';

export const orderIdSchema = z.string().uuid();
export const customerIdSchema = z.string().uuid();
export const orderStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'REJECTED']);

export const createOrderRequestSchema = z
  .object({
    customerId: customerIdSchema,
    items: z.array(orderItemSchema).min(1),
    currency: currencySchema,
  })
  .strict();

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const orderSchema = z
  .object({
    orderId: orderIdSchema,
    customerId: customerIdSchema,
    items: z.array(orderItemSchema).min(1),
    totalAmount: z.number().finite().nonnegative(),
    currency: currencySchema,
    status: orderStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type Order = z.infer<typeof orderSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
