import { productIdSchema, timestampSchema } from '@smartretailx/api-contracts';
import { z } from 'zod';

export const inventoryItemSchema = z
  .object({
    productId: productIdSchema,
    availableQuantity: z.number().int().nonnegative(),
    updatedAt: timestampSchema,
  })
  .strict();

export type InventoryItem = z.infer<typeof inventoryItemSchema>;
