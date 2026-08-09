import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EventBridgeEventPublisher } from './eventbridge-event-publisher.js';
import { readEventRelayConfiguration } from './event-relay-configuration.js';
import type { EventRelayConfiguration } from './event-relay-configuration.js';
import { createOrderCreatedRelayHandler } from './order-created-relay-handler.js';
import type { OrderCreatedRelayHandler } from './order-created-relay-handler.js';

export const createEventRelayHandler = (
  configuration: EventRelayConfiguration,
  client: EventBridgeClient = new EventBridgeClient({}),
): OrderCreatedRelayHandler => {
  const publisher = new EventBridgeEventPublisher(client, configuration.eventBusName);
  return createOrderCreatedRelayHandler(publisher);
};

export const createEventRelayHandlerFromEnvironment = (
  environment?: NodeJS.ProcessEnv,
): OrderCreatedRelayHandler => {
  const configuration = readEventRelayConfiguration(environment);
  return createEventRelayHandler(configuration);
};
