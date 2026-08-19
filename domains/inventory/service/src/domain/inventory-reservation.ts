import { productIdSchema, timestampSchema } from '@smartretailx/api-contracts';
import { z } from 'zod';
import { InventoryQuantityOverflowError } from './errors.js';

export const INVENTORY_RESERVATION_OUTCOME = {
  RESERVED: 'RESERVED',
  REJECTED: 'REJECTED',
} as const;

export const INVENTORY_REJECTION_REASON = {
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
} as const;

export interface RequestedInventoryItem {
  readonly productId: string;
  readonly quantity: number;
}

export const inventoryReservationItemSchema = z
  .object({
    productId: productIdSchema,
    quantity: z.number().int().positive(),
  })
  .strict();

export const insufficientInventoryItemSchema = z
  .object({
    productId: productIdSchema,
    requestedQuantity: z.number().int().positive(),
    availableQuantity: z.number().int().nonnegative(),
  })
  .strict();

const inventoryReservationBaseSchema = z.object({
  eventId: z.string().uuid(),
  orderId: z.string().uuid(),
  correlationId: z.string().uuid(),
  items: z.array(inventoryReservationItemSchema).min(1),
  processedAt: timestampSchema,
});

const reservedInventoryReservationSchema = inventoryReservationBaseSchema
  .extend({
    outcome: z.literal(INVENTORY_RESERVATION_OUTCOME.RESERVED),
  })
  .strict();

const rejectedInventoryReservationSchema = inventoryReservationBaseSchema
  .extend({
    outcome: z.literal(INVENTORY_RESERVATION_OUTCOME.REJECTED),
    reason: z.literal(INVENTORY_REJECTION_REASON.INSUFFICIENT_STOCK),
    insufficientItems: z.array(insufficientInventoryItemSchema).min(1),
  })
  .strict();

export const inventoryReservationSchema = z.discriminatedUnion('outcome', [
  reservedInventoryReservationSchema,
  rejectedInventoryReservationSchema,
]);

export type InventoryReservationItem = z.infer<typeof inventoryReservationItemSchema>;
export type InsufficientInventoryItem = z.infer<typeof insufficientInventoryItemSchema>;
export type InventoryReservation = z.infer<typeof inventoryReservationSchema>;

export const aggregateReservationItems = (
  items: readonly RequestedInventoryItem[],
): InventoryReservationItem[] => {
  const quantitiesByProduct = new Map<string, number>();

  for (const item of items) {
    const currentQuantity = quantitiesByProduct.get(item.productId) ?? 0;
    const aggregatedQuantity = currentQuantity + item.quantity;

    if (!Number.isSafeInteger(aggregatedQuantity)) {
      throw new InventoryQuantityOverflowError(item.productId);
    }

    quantitiesByProduct.set(item.productId, aggregatedQuantity);
  }

  return [...quantitiesByProduct].map(([productId, quantity]) =>
    inventoryReservationItemSchema.parse({ productId, quantity }),
  );
};

export const copyInventoryReservation = (reservation: InventoryReservation): InventoryReservation =>
  inventoryReservationSchema.parse({
    ...reservation,
    items: reservation.items.map((item) => ({ ...item })),
    ...(reservation.outcome === INVENTORY_RESERVATION_OUTCOME.REJECTED
      ? {
          insufficientItems: reservation.insufficientItems.map((item) => ({ ...item })),
        }
      : {}),
  });
