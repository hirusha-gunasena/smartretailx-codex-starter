import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EventBridgeInventoryEventPublisher } from './eventbridge-inventory-event-publisher.js';
import { readInventoryOutcomeRelayConfiguration } from './inventory-outcome-relay-configuration.js';
import type { InventoryOutcomeRelayConfiguration } from './inventory-outcome-relay-configuration.js';
import { createInventoryOutcomeRelayHandler } from './inventory-outcome-relay-handler.js';
import type { InventoryOutcomeRelayHandler } from './inventory-outcome-relay-handler.js';

export const createInventoryOutcomeRelay = (
  configuration: InventoryOutcomeRelayConfiguration,
  client: EventBridgeClient = new EventBridgeClient({}),
): InventoryOutcomeRelayHandler => {
  const publisher = new EventBridgeInventoryEventPublisher(client, configuration.eventBusName);
  return createInventoryOutcomeRelayHandler(publisher);
};

export const createInventoryOutcomeRelayFromEnvironment = (
  environment?: NodeJS.ProcessEnv,
): InventoryOutcomeRelayHandler => {
  const configuration = readInventoryOutcomeRelayConfiguration(environment);
  return createInventoryOutcomeRelay(configuration);
};
