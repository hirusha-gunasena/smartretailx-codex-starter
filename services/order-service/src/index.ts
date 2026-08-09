export { createOrderRouter } from './adapters/http/order-controller.js';
export type { OrderUseCases } from './adapters/http/order-controller.js';
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
export { readConfiguration } from './composition/configuration.js';
export type { OrderServiceConfiguration } from './composition/configuration.js';
export {
  RandomUuidGenerator,
  SystemClock,
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
