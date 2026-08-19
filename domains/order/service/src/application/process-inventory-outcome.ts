import {
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
} from '@smartretailx/event-contracts';
import type { InventoryRejectedEvent, InventoryReservedEvent } from '@smartretailx/event-contracts';
import { OrderWorkflowValidationError } from '../domain/errors.js';
import type {
  OrderWorkflowRepository,
  OrderWorkflowTransitionResult,
} from './ports/order-workflow-repository.js';

export type InventoryOutcomeEvent = InventoryReservedEvent | InventoryRejectedEvent;

const validateCanonicalEvent = (event: InventoryOutcomeEvent): InventoryOutcomeEvent =>
  event.eventType === 'InventoryReserved'
    ? inventoryReservedEventSchema.parse(event)
    : inventoryRejectedEventSchema.parse(event);

export class ProcessInventoryOutcome {
  public constructor(private readonly repository: OrderWorkflowRepository) {}

  public async execute(event: InventoryOutcomeEvent): Promise<OrderWorkflowTransitionResult> {
    const canonicalEvent = validateCanonicalEvent(event);
    const { orderId } = canonicalEvent.data;

    if (canonicalEvent.correlationId !== orderId) {
      throw new OrderWorkflowValidationError(
        orderId,
        'The inventory outcome correlationId must equal its orderId.',
      );
    }

    if (canonicalEvent.eventType === 'InventoryReserved') {
      return this.repository.transitionFromPending({
        orderId,
        targetStatus: 'CONFIRMED',
        reservationId: canonicalEvent.data.reservationId,
        updatedAt: canonicalEvent.occurredAt,
      });
    }

    return this.repository.transitionFromPending({
      orderId,
      targetStatus: 'REJECTED',
      rejectionReason: canonicalEvent.data.reason,
      updatedAt: canonicalEvent.occurredAt,
    });
  }
}
