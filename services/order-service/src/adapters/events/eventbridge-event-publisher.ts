import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { orderCreatedEventSchema } from '@smartretailx/event-contracts';
import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import type { EventPublisher } from '../../application/ports/event-publisher.js';

const EVENTBRIDGE_SOURCE = 'smartretailx.order-service';
const EVENTBRIDGE_DETAIL_TYPE = 'OrderCreated';

export class EventPublicationError extends Error {
  public readonly code = 'EVENT_PUBLICATION_FAILED';

  public constructor(
    public readonly eventId: string,
    public readonly eventBridgeErrorCode: string,
  ) {
    super(`EventBridge rejected OrderCreated event '${eventId}' (${eventBridgeErrorCode}).`);
    this.name = new.target.name;
  }
}

export class EventBridgeEventPublisher implements EventPublisher<OrderCreatedEvent> {
  public constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
  ) {
    if (eventBusName.trim().length === 0) {
      throw new Error('A non-empty EventBridge event bus name is required.');
    }
  }

  public async publish(event: OrderCreatedEvent): Promise<void> {
    const canonicalEvent = orderCreatedEventSchema.parse(event);
    const output = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: EVENTBRIDGE_SOURCE,
            DetailType: EVENTBRIDGE_DETAIL_TYPE,
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
        canonicalEvent.eventId,
        entry?.ErrorCode ?? 'UNKNOWN_EVENTBRIDGE_FAILURE',
      );
    }
  }
}
