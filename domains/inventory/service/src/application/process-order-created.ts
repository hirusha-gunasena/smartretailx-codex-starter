import { orderCreatedEventSchema } from '@smartretailx/event-contracts';
import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import { InventoryTransactionLimitError } from '../domain/errors.js';
import { aggregateReservationItems } from '../domain/inventory-reservation.js';
import type { Clock } from './ports/clock.js';
import type {
  InventoryReservationRepository,
  InventoryReservationResult,
} from './ports/inventory-reservation-repository.js';

export const DYNAMODB_TRANSACTION_ACTION_LIMIT = 100;
export const MAX_DISTINCT_PRODUCTS_PER_RESERVATION = DYNAMODB_TRANSACTION_ACTION_LIMIT - 1;

export class ProcessOrderCreated {
  public constructor(
    private readonly repository: InventoryReservationRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(event: OrderCreatedEvent): Promise<InventoryReservationResult> {
    const canonicalEvent = orderCreatedEventSchema.parse(event);
    const items = aggregateReservationItems(canonicalEvent.data.items);

    if (items.length > MAX_DISTINCT_PRODUCTS_PER_RESERVATION) {
      throw new InventoryTransactionLimitError(items.length, MAX_DISTINCT_PRODUCTS_PER_RESERVATION);
    }

    return this.repository.reserve({
      eventId: canonicalEvent.eventId,
      orderId: canonicalEvent.data.orderId,
      correlationId: canonicalEvent.correlationId,
      items,
      processedAt: this.clock.now(),
    });
  }
}
