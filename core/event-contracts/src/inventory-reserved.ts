import { z } from 'zod';
import { createEventEnvelopeSchema } from './envelope.js';
import { reservedInventoryItemSchema } from './shared.js';

export const inventoryReservedDataSchema = z
  .object({
    orderId: z.string().uuid(),
    reservationId: z.string().uuid(),
    items: z.array(reservedInventoryItemSchema).min(1),
  })
  .strict();

export const inventoryReservedEventSchema = createEventEnvelopeSchema(
  'InventoryReserved',
  'inventory-service',
  inventoryReservedDataSchema,
);

export type InventoryReservedData = z.infer<typeof inventoryReservedDataSchema>;
export type InventoryReservedEvent = z.infer<typeof inventoryReservedEventSchema>;
