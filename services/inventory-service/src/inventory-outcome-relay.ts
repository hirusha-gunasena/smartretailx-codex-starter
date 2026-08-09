import { createInventoryOutcomeRelayFromEnvironment } from './adapters/events/inventory-outcome-relay-composition.js';

export const handler = createInventoryOutcomeRelayFromEnvironment();
