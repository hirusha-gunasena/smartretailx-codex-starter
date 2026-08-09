import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import {
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderRejectedEventSchema,
} from '@smartretailx/event-contracts';
import type { EventPublisher } from '../../application/ports/event-publisher.js';
import type { OrderLifecycleEvent } from './dynamodb-order-stream-mapper.js';

const EVENTBRIDGE_SOURCE = 'smartretailx.order-service';

const validateCanonicalEvent = (event: OrderLifecycleEvent): OrderLifecycleEvent => {
  switch (event.eventType) {
    case 'OrderCreated':
      return orderCreatedEventSchema.parse(event);
    case 'OrderConfirmed':
      return orderConfirmedEventSchema.parse(event);
    case 'OrderRejected':
      return orderRejectedEventSchema.parse(event);
  }
};

export class EventPublicationError extends Error {
  public readonly code = 'EVENT_PUBLICATION_FAILED';

  public constructor(
    public readonly eventId: string,
    public readonly eventBridgeErrorCode: string,
    public readonly eventType: OrderLifecycleEvent['eventType'] = 'OrderCreated',
  ) {
    super(`EventBridge rejected ${eventType} event '${eventId}' (${eventBridgeErrorCode}).`);
    this.name = new.target.name;
  }
}

export class EventBridgeEventPublisher implements EventPublisher<OrderLifecycleEvent> {
  public constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
  ) {
    if (eventBusName.trim().length === 0) {
      throw new Error('A non-empty EventBridge event bus name is required.');
    }
  }

  public async publish(event: OrderLifecycleEvent): Promise<void> {
    const canonicalEvent = validateCanonicalEvent(event);
    const output = await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: EVENTBRIDGE_SOURCE,
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
        canonicalEvent.eventId,
        entry?.ErrorCode ?? 'UNKNOWN_EVENTBRIDGE_FAILURE',
        canonicalEvent.eventType,
      );
    }
  }
}
