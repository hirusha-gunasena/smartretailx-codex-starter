import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EventBridgeEventPublisher } from './eventbridge-event-publisher.js';
import { readEventRelayConfiguration } from './event-relay-configuration.js';
import type { EventRelayConfiguration } from './event-relay-configuration.js';
import { createOrderLifecycleRelayHandler } from './order-created-relay-handler.js';
import type { OrderLifecycleRelayHandler } from './order-created-relay-handler.js';

export const createEventRelayHandler = (
  configuration: EventRelayConfiguration,
  client: EventBridgeClient = new EventBridgeClient({}),
): OrderLifecycleRelayHandler => {
  const publisher = new EventBridgeEventPublisher(client, configuration.eventBusName);
  return createOrderLifecycleRelayHandler(publisher);
};

export const createEventRelayHandlerFromEnvironment = (
  environment?: NodeJS.ProcessEnv,
): OrderLifecycleRelayHandler => {
  const configuration = readEventRelayConfiguration(environment);
  return createEventRelayHandler(configuration);
};
