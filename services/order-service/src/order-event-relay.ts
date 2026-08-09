import { createEventRelayHandlerFromEnvironment } from './adapters/events/event-relay-composition.js';

export const handler = createEventRelayHandlerFromEnvironment();
