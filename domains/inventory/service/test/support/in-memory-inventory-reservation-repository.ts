import type {
  InventoryReservationRepository,
  InventoryReservationResult,
  ReserveInventoryRequest,
} from '../../src/index.js';
import {
  INVENTORY_REJECTION_REASON,
  INVENTORY_RESERVATION_OUTCOME,
  copyInventoryReservation,
  inventoryReservationSchema,
} from '../../src/index.js';
import type { InventoryReservation } from '../../src/index.js';

export class InMemoryInventoryReservationRepository implements InventoryReservationRepository {
  public readonly requests: ReserveInventoryRequest[] = [];
  private readonly reservations = new Map<string, InventoryReservation>();

  public constructor(private readonly stock: Map<string, number>) {}

  public async reserve(request: ReserveInventoryRequest): Promise<InventoryReservationResult> {
    this.requests.push({
      ...request,
      items: request.items.map((item) => ({ ...item })),
    });

    const existing = this.reservations.get(request.eventId);
    if (existing !== undefined) {
      return { reservation: copyInventoryReservation(existing), idempotent: true };
    }

    const insufficientItems = request.items
      .filter((item) => (this.stock.get(item.productId) ?? 0) < item.quantity)
      .map((item) => ({
        productId: item.productId,
        requestedQuantity: item.quantity,
        availableQuantity: this.stock.get(item.productId) ?? 0,
      }));

    const reservation = inventoryReservationSchema.parse(
      insufficientItems.length === 0
        ? {
            eventId: request.eventId,
            orderId: request.orderId,
            correlationId: request.correlationId,
            outcome: INVENTORY_RESERVATION_OUTCOME.RESERVED,
            items: request.items,
            processedAt: request.processedAt,
          }
        : {
            eventId: request.eventId,
            orderId: request.orderId,
            correlationId: request.correlationId,
            outcome: INVENTORY_RESERVATION_OUTCOME.REJECTED,
            reason: INVENTORY_REJECTION_REASON.INSUFFICIENT_STOCK,
            items: request.items,
            insufficientItems,
            processedAt: request.processedAt,
          },
    );

    if (reservation.outcome === INVENTORY_RESERVATION_OUTCOME.RESERVED) {
      for (const item of request.items) {
        this.stock.set(item.productId, this.stock.get(item.productId)! - item.quantity);
      }
    }

    this.reservations.set(request.eventId, copyInventoryReservation(reservation));
    return { reservation: copyInventoryReservation(reservation), idempotent: false };
  }

  public availableQuantity(productId: string): number | undefined {
    return this.stock.get(productId);
  }
}
