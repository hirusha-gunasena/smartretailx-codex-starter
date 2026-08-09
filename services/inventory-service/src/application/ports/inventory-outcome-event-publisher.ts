import type { InventoryRejectedEvent, InventoryReservedEvent } from '@smartretailx/event-contracts';

export type InventoryOutcomeEvent = InventoryReservedEvent | InventoryRejectedEvent;

/** Application-facing publication boundary. AWS SDK types remain in adapter code. */
export interface InventoryOutcomeEventPublisher {
  publish(event: InventoryOutcomeEvent): Promise<void>;
}
