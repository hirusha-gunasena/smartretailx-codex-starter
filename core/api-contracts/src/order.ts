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

const orderBaseShape = {
  orderId: orderIdSchema,
  customerId: customerIdSchema,
  items: z.array(orderItemSchema).min(1),
  totalAmount: z.number().finite().nonnegative(),
  currency: currencySchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};

export const pendingOrderSchema = z
  .object({
    ...orderBaseShape,
    status: z.literal('PENDING'),
  })
  .strict();

export const confirmedOrderSchema = z
  .object({
    ...orderBaseShape,
    status: z.literal('CONFIRMED'),
    reservationId: z.string().uuid(),
  })
  .strict();

export const rejectedOrderSchema = z
  .object({
    ...orderBaseShape,
    status: z.literal('REJECTED'),
    rejectionReason: z.string().trim().min(1),
  })
  .strict();

export const orderSchema = z.discriminatedUnion('status', [
  pendingOrderSchema,
  confirmedOrderSchema,
  rejectedOrderSchema,
]);

export type Order = z.infer<typeof orderSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type PendingOrder = z.infer<typeof pendingOrderSchema>;
export type ConfirmedOrder = z.infer<typeof confirmedOrderSchema>;
export type RejectedOrder = z.infer<typeof rejectedOrderSchema>;
