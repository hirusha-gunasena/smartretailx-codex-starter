import { z } from 'zod';
import { inventoryRejectedEventSchema } from './inventory-rejected.js';
import { inventoryReservedEventSchema } from './inventory-reserved.js';
import { orderConfirmedEventSchema } from './order-confirmed.js';
import { orderCreatedEventSchema } from './order-created.js';
import { orderRejectedEventSchema } from './order-rejected.js';

export { EVENT_VERSION, createEventEnvelopeSchema, eventEnvelopeSchema } from './envelope.js';
export type { EventEnvelope } from './envelope.js';

export { inventoryRejectedDataSchema, inventoryRejectedEventSchema } from './inventory-rejected.js';
export type { InventoryRejectedData, InventoryRejectedEvent } from './inventory-rejected.js';

export { inventoryReservedDataSchema, inventoryReservedEventSchema } from './inventory-reserved.js';
export type { InventoryReservedData, InventoryReservedEvent } from './inventory-reserved.js';

export { orderConfirmedDataSchema, orderConfirmedEventSchema } from './order-confirmed.js';
export type { OrderConfirmedData, OrderConfirmedEvent } from './order-confirmed.js';

export { orderCreatedDataSchema, orderCreatedEventSchema } from './order-created.js';
export type { OrderCreatedData, OrderCreatedEvent } from './order-created.js';

export { orderRejectedDataSchema, orderRejectedEventSchema } from './order-rejected.js';
export type { OrderRejectedData, OrderRejectedEvent } from './order-rejected.js';

export {
  orderLineSchema,
  rejectedInventoryItemSchema,
  reservedInventoryItemSchema,
} from './shared.js';
export type { OrderLine, RejectedInventoryItem, ReservedInventoryItem } from './shared.js';

export const domainEventSchema = z.discriminatedUnion('eventType', [
  orderCreatedEventSchema,
  inventoryReservedEventSchema,
  inventoryRejectedEventSchema,
  orderConfirmedEventSchema,
  orderRejectedEventSchema,
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
