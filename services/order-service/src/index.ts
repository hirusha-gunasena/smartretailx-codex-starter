export { createOrderRouter } from './adapters/http/order-controller.js';
export type { OrderUseCases } from './adapters/http/order-controller.js';
export { createDynamoDBDocumentClient } from './adapters/dynamodb/dynamodb-client.js';
export { DynamoDBOrderRepository } from './adapters/dynamodb/dynamodb-order-repository.js';
export {
  OrderStreamRecordError,
  createOrderCreatedEventId,
  mapOrderStreamRecord,
} from './adapters/events/dynamodb-order-stream-mapper.js';
export {
  EventBridgeEventPublisher,
  EventPublicationError,
} from './adapters/events/eventbridge-event-publisher.js';
export {
  createEventRelayHandler,
  createEventRelayHandlerFromEnvironment,
} from './adapters/events/event-relay-composition.js';
export { readEventRelayConfiguration } from './adapters/events/event-relay-configuration.js';
export type { EventRelayConfiguration } from './adapters/events/event-relay-configuration.js';
export {
  UnreportableStreamRecordFailureError,
  createOrderCreatedRelayHandler,
  processOrderStreamRecord,
} from './adapters/events/order-created-relay-handler.js';
export type { OrderCreatedRelayHandler } from './adapters/events/order-created-relay-handler.js';
export { InMemoryOrderRepository } from './adapters/persistence/in-memory-order-repository.js';

export { CreateOrder } from './application/create-order.js';
export { GetOrder } from './application/get-order.js';
export { ListOrders } from './application/list-orders.js';
export type { Clock } from './application/ports/clock.js';
export type { EventPublisher } from './application/ports/event-publisher.js';
export type { IdGenerator } from './application/ports/id-generator.js';
export type { OrderRepository } from './application/ports/order-repository.js';

export { createApp } from './composition/create-app.js';
export type { OrderAppDependencies } from './composition/create-app.js';
export { readConfiguration, readProductionConfiguration } from './composition/configuration.js';
export type {
  OrderServiceConfiguration,
  ProductionOrderServiceConfiguration,
} from './composition/configuration.js';
export { createProductionApp } from './composition/production-composition.js';
export {
  RandomUuidGenerator,
  SystemClock,
  createInMemoryDependencies,
  createSystemDependencies,
} from './composition/system-dependencies.js';

export {
  OrderConflictError,
  OrderNotFoundError,
  OrderServiceError,
  OrderValidationError,
} from './domain/errors.js';
export type { OrderValidationIssue } from './domain/errors.js';
export { calculateOrderTotal } from './domain/money.js';
export { OrderEntity, copyOrder } from './domain/order.js';
export { ORDER_STATUS } from './domain/order-status.js';
