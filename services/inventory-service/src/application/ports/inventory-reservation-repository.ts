import type {
  InventoryReservation,
  InventoryReservationItem,
} from '../../domain/inventory-reservation.js';

export interface ReserveInventoryRequest {
  readonly eventId: string;
  readonly orderId: string;
  readonly correlationId: string;
  readonly items: readonly InventoryReservationItem[];
  readonly processedAt: string;
}

export interface InventoryReservationResult {
  readonly reservation: InventoryReservation;
  readonly idempotent: boolean;
}

/** Storage-agnostic boundary for atomic inventory reservation and durable idempotency. */
export interface InventoryReservationRepository {
  reserve(request: ReserveInventoryRequest): Promise<InventoryReservationResult>;
}
