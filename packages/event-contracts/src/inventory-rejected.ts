import { z } from 'zod';
import { createEventEnvelopeSchema } from './envelope.js';
import { rejectedInventoryItemSchema } from './shared.js';

export const inventoryRejectedDataSchema = z
  .object({
    orderId: z.string().uuid(),
    reason: z.string().trim().min(1),
    items: z.array(rejectedInventoryItemSchema).min(1),
  })
  .strict();

export const inventoryRejectedEventSchema = createEventEnvelopeSchema(
  'InventoryRejected',
  'inventory-service',
  inventoryRejectedDataSchema,
);

export type InventoryRejectedData = z.infer<typeof inventoryRejectedDataSchema>;
export type InventoryRejectedEvent = z.infer<typeof inventoryRejectedEventSchema>;
