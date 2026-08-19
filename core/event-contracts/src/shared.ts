import { z } from 'zod';

export const orderLineSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().finite().nonnegative(),
  })
  .strict();

export type OrderLine = z.infer<typeof orderLineSchema>;

export const reservedInventoryItemSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })
  .strict();

export type ReservedInventoryItem = z.infer<typeof reservedInventoryItemSchema>;

export const rejectedInventoryItemSchema = z
  .object({
    productId: z.string().uuid(),
    requestedQuantity: z.number().int().positive(),
    availableQuantity: z.number().int().nonnegative(),
  })
  .strict();

export type RejectedInventoryItem = z.infer<typeof rejectedInventoryItemSchema>;
