export { createOrderRouter } from './adapters/http/order-controller.js';
export type { OrderHttpSecurity, OrderUseCases } from './adapters/http/order-controller.js';
export {
  CognitoOrderCallerAuthenticator,
  createAwsCognitoOrderCallerAuthenticator,
} from './adapters/auth/cognito-order-caller-authenticator.js';
export type {
  AwsCognitoOrderAuthenticatorConfiguration,
  CognitoAccessTokenVerifier,
} from './adapters/auth/cognito-order-caller-authenticator.js';
export { createDynamoDBDocumentClient } from './adapters/dynamodb/dynamodb-client.js';
export {
  CUSTOMER_ORDERS_INDEX_NAME,
  DynamoDBOrderRepository,
} from './adapters/dynamodb/dynamodb-order-repository.js';
export { DynamoDBOrderWorkflowRepository } from './adapters/dynamodb/dynamodb-order-workflow-repository.js';
export {
  OrderLifecycleTransitionError,
  OrderStreamRecordError,
  createOrderConfirmedEventId,
  createOrderCreatedEventId,
  createOrderRejectedEventId,
  mapOrderStreamRecord,
} from './adapters/events/dynamodb-order-stream-mapper.js';
export type { OrderLifecycleEvent } from './adapters/events/dynamodb-order-stream-mapper.js';
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
  createOrderLifecycleRelayHandler,
  processOrderStreamRecord,
} from './adapters/events/order-created-relay-handler.js';
export type {
  OrderCreatedRelayHandler,
  OrderLifecycleRelayHandler,
} from './adapters/events/order-created-relay-handler.js';
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
export { ConsoleOrderAuthorizationTelemetry } from './adapters/telemetry/console-order-authorization-telemetry.js';
export { ConsoleSagaTelemetry } from './adapters/telemetry/console-saga-telemetry.js';

export { CreateOrder } from './application/create-order.js';
export { GetOrder } from './application/get-order.js';
export { ListOrders } from './application/list-orders.js';
export { ProcessInventoryOutcome } from './application/process-inventory-outcome.js';
export type { InventoryOutcomeEvent } from './application/process-inventory-outcome.js';
export type { Clock } from './application/ports/clock.js';
export type { EventPublisher } from './application/ports/event-publisher.js';
export type { IdGenerator } from './application/ports/id-generator.js';
export type {
  OrderSagaOutcome,
  OrderSagaStage,
  SagaInvocationContext,
  SagaSuccessTelemetryEntry,
  SagaTelemetry,
} from './application/ports/saga-telemetry.js';
export type {
  OrderAuthorizationReasonCode,
  OrderAuthorizationTelemetry,
  OrderAuthorizationTelemetryEntry,
} from './application/ports/order-authorization-telemetry.js';
export type {
  OrderCallerAuthenticator,
  OrderRole,
  VerifiedOrderCaller,
} from './application/ports/order-caller-authenticator.js';
export type { OrderRepository } from './application/ports/order-repository.js';
export { ORDER_WORKFLOW_TRANSITION_RESULT } from './application/ports/order-workflow-repository.js';
export type {
  ConfirmedOrderWorkflowTransition,
  OrderWorkflowRepository,
  OrderWorkflowTargetStatus,
  OrderWorkflowTransition,
  OrderWorkflowTransitionResult,
  RejectedOrderWorkflowTransition,
} from './application/ports/order-workflow-repository.js';

export { createApp } from './composition/create-app.js';
export type { OrderAppDependencies } from './composition/create-app.js';
export { readConfiguration, readProductionConfiguration } from './composition/configuration.js';
export type {
  OrderServiceConfiguration,
  ProductionOrderServiceConfiguration,
} from './composition/configuration.js';
export { createProductionApp } from './composition/production-composition.js';
export { createGracefulShutdownHandler, startOrderHttpServer } from './composition/http-server.js';
export type {
  OrderServerLogEntry,
  OrderServerLogSink,
  ShutdownSignal,
} from './composition/http-server.js';
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
  OrderAuthenticationError,
  OrderAuthorizationError,
  OrderOwnershipMismatchError,
} from './domain/authorization-errors.js';
export type {
  OrderAuthenticationReasonCode,
  OrderAuthorizationReasonCode as OrderAuthorizationErrorReasonCode,
} from './domain/authorization-errors.js';
export {
  OrderConflictError,
  OrderNotFoundError,
  OrderServiceError,
  OrderValidationError,
  OrderWorkflowConflictError,
  OrderWorkflowValidationError,
} from './domain/errors.js';
export type { OrderValidationIssue } from './domain/errors.js';
export {
  CUSTOMER_UUID_NAMESPACE,
  customerIdForCognitoSubject,
} from './domain/customer-identity.js';
export { UUID_V5_DNS_NAMESPACE, UUID_V5_URL_NAMESPACE, createUuidV5 } from './domain/uuid-v5.js';
export { calculateOrderTotal } from './domain/money.js';
export { OrderEntity, copyOrder } from './domain/order.js';
export { ORDER_STATUS } from './domain/order-status.js';
