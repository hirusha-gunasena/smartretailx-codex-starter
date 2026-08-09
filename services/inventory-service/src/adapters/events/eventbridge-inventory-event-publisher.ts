import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import {
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
} from '@smartretailx/event-contracts';
import type { InventoryOutcomeEventPublisher } from '../../application/ports/inventory-outcome-event-publisher.js';
import type { InventoryOutcomeEvent } from '../../application/ports/inventory-outcome-event-publisher.js';

export const INVENTORY_EVENTBRIDGE_SOURCE = 'smartretailx.inventory-service';

export class EventPublicationError extends Error {
  public readonly code = 'EVENT_PUBLICATION_FAILED';

  public constructor(
    public readonly eventType: InventoryOutcomeEvent['eventType'],
    public readonly eventBridgeErrorCode: string,
  ) {
    super(`EventBridge rejected ${eventType} (${eventBridgeErrorCode}).`);
    this.name = new.target.name;
  }
}

const parseInventoryOutcomeEvent = (event: InventoryOutcomeEvent): InventoryOutcomeEvent =>
  event.eventType === 'InventoryReserved'
    ? inventoryReservedEventSchema.parse(event)
    : inventoryRejectedEventSchema.parse(event);

export class EventBridgeInventoryEventPublisher implements InventoryOutcomeEventPublisher {
  public constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
  ) {
    if (eventBusName.trim().length === 0) {
      throw new Error('A non-empty Inventory EventBridge event bus name is required.');
    }
  }

  public async publish(event: InventoryOutcomeEvent): Promise<void> {
    const canonicalEvent = parseInventoryOutcomeEvent(event);
    const output = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: INVENTORY_EVENTBRIDGE_SOURCE,
            DetailType: canonicalEvent.eventType,
            Detail: JSON.stringify(canonicalEvent),
          },
        ],
      }),
    );
    const entry = output.Entries?.[0];

    if (
      (output.FailedEntryCount ?? 0) > 0 ||
      entry === undefined ||
      entry.ErrorCode !== undefined
    ) {
      throw new EventPublicationError(
        canonicalEvent.eventType,
        entry?.ErrorCode?.trim() || 'UNKNOWN_EVENTBRIDGE_FAILURE',
      );
    }
  }
}
