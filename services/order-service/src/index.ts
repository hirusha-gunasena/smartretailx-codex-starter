export { createOrderRouter } from './adapters/http/order-controller.js';
export type { OrderUseCases } from './adapters/http/order-controller.js';
export { createDynamoDBDocumentClient } from './adapters/dynamodb/dynamodb-client.js';
export { DynamoDBOrderRepository } from './adapters/dynamodb/dynamodb-order-repository.js';
export { DynamoDBOrderWorkflowRepository } from './adapters/dynamodb/dynamodb-order-workflow-repository.js';
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
export {
  INVENTORY_OUTCOME_EVENTBRIDGE_SOURCE,
  eventBridgeInventoryOutcomeEnvelopeSchema,
  eventBridgeInventoryRejectedEnvelopeSchema,
  eventBridgeInventoryReservedEnvelopeSchema,
  parseInventoryOutcomeMessage,
} from './adapters/events/inventory-outcome-message-parser.js';
export type { InventoryOutcomeEvent as ParsedInventoryOutcomeEvent } from './adapters/events/inventory-outcome-message-parser.js';
export { createOrderWorkflowSqsHandler } from './adapters/events/order-workflow-sqs-handler.js';
export type {
  InventoryOutcomeMessageParser,
  InventoryOutcomeProcessor,
  OrderWorkflowSqsHandler,
} from './adapters/events/order-workflow-sqs-handler.js';
export { InMemoryOrderRepository } from './adapters/persistence/in-memory-order-repository.js';

export { CreateOrder } from './application/create-order.js';
export { GetOrder } from './application/get-order.js';
export { ListOrders } from './application/list-orders.js';
export { ProcessInventoryOutcome } from './application/process-inventory-outcome.js';
export type { InventoryOutcomeEvent } from './application/process-inventory-outcome.js';
export type { Clock } from './application/ports/clock.js';
export type { EventPublisher } from './application/ports/event-publisher.js';
export type { IdGenerator } from './application/ports/id-generator.js';
export type { OrderRepository } from './application/ports/order-repository.js';
export { ORDER_WORKFLOW_TRANSITION_RESULT } from './application/ports/order-workflow-repository.js';
export type {
  OrderWorkflowRepository,
  OrderWorkflowTargetStatus,
  OrderWorkflowTransition,
  OrderWorkflowTransitionResult,
} from './application/ports/order-workflow-repository.js';

export { createApp } from './composition/create-app.js';
export type { OrderAppDependencies } from './composition/create-app.js';
export { readConfiguration, readProductionConfiguration } from './composition/configuration.js';
export type {
  OrderServiceConfiguration,
  ProductionOrderServiceConfiguration,
} from './composition/configuration.js';
export { createProductionApp } from './composition/production-composition.js';
export {
  createOrderWorkflowHandler,
  createOrderWorkflowHandlerFromEnvironment,
} from './composition/order-workflow-composition.js';
export { readOrderWorkflowConfiguration } from './composition/order-workflow-configuration.js';
export type { OrderWorkflowConfiguration } from './composition/order-workflow-configuration.js';
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
  OrderWorkflowConflictError,
  OrderWorkflowValidationError,
} from './domain/errors.js';
export type { OrderValidationIssue } from './domain/errors.js';
export { calculateOrderTotal } from './domain/money.js';
export { OrderEntity, copyOrder } from './domain/order.js';
export { ORDER_STATUS } from './domain/order-status.js';
