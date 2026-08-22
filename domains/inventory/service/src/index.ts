export { createDynamoDBDocumentClient } from './adapters/dynamodb/dynamodb-client.js';
export { DynamoDBInventoryReservationRepository } from './adapters/dynamodb/dynamodb-inventory-reservation-repository.js';
export {
  EventBridgeInventoryEventPublisher,
  EventPublicationError,
  INVENTORY_EVENTBRIDGE_SOURCE,
} from './adapters/events/eventbridge-inventory-event-publisher.js';
export {
  INVENTORY_OUTCOME_EVENT_TYPE,
  INVENTORY_OUTCOME_EVENT_UUID_NAMESPACE,
  InventoryOutcomeStreamRecordError,
  createInventoryOutcomeEventId,
  mapInventoryOutcomeStreamRecord,
} from './adapters/events/inventory-outcome-stream-mapper.js';
export type {
  InventoryOutcomeEvent,
  InventoryOutcomeEventType,
} from './adapters/events/inventory-outcome-stream-mapper.js';
export {
  createInventoryOutcomeRelay,
  createInventoryOutcomeRelayFromEnvironment,
} from './adapters/events/inventory-outcome-relay-composition.js';
export { readInventoryOutcomeRelayConfiguration } from './adapters/events/inventory-outcome-relay-configuration.js';
export type { InventoryOutcomeRelayConfiguration } from './adapters/events/inventory-outcome-relay-configuration.js';
export {
  UnreportableStreamRecordFailureError,
  createInventoryOutcomeRelayHandler,
  processInventoryOutcomeRecord,
} from './adapters/events/inventory-outcome-relay-handler.js';
export type { InventoryOutcomeRelayHandler } from './adapters/events/inventory-outcome-relay-handler.js';
export { createInventorySqsHandler } from './adapters/sqs/inventory-sqs-handler.js';
export type {
  InventorySqsHandler,
  OrderCreatedMessageParser,
  OrderCreatedProcessor,
} from './adapters/sqs/inventory-sqs-handler.js';
export { ConsoleSagaTelemetry } from './adapters/telemetry/console-saga-telemetry.js';
export {
  ORDER_CREATED_EVENTBRIDGE_SOURCE,
  eventBridgeOrderCreatedEnvelopeSchema,
  parseOrderCreatedMessage,
} from './adapters/sqs/order-created-message-parser.js';
export type { Clock } from './application/ports/clock.js';
export type {
  InventorySagaOutcome,
  InventorySagaStage,
  SagaInvocationContext,
  SagaSuccessTelemetryEntry,
  SagaTelemetry,
} from './application/ports/saga-telemetry.js';
export type { InventoryOutcomeEventPublisher } from './application/ports/inventory-outcome-event-publisher.js';
export type {
  InventoryReservationRepository,
  InventoryReservationResult,
  ReserveInventoryRequest,
} from './application/ports/inventory-reservation-repository.js';
export {
  DYNAMODB_TRANSACTION_ACTION_LIMIT,
  MAX_DISTINCT_PRODUCTS_PER_RESERVATION,
  ProcessOrderCreated,
} from './application/process-order-created.js';
export { readInventoryConfiguration } from './composition/configuration.js';
export type { InventoryServiceConfiguration } from './composition/configuration.js';
export {
  SystemClock,
  createProductionInventoryHandler,
} from './composition/production-composition.js';
export {
  InventoryQuantityOverflowError,
  InventoryServiceError,
  InventoryTransactionLimitError,
} from './domain/errors.js';
export { inventoryItemSchema } from './domain/inventory-item.js';
export type { InventoryItem } from './domain/inventory-item.js';
export {
  INVENTORY_REJECTION_REASON,
  INVENTORY_RESERVATION_OUTCOME,
  aggregateReservationItems,
  copyInventoryReservation,
  insufficientInventoryItemSchema,
  inventoryReservationItemSchema,
  inventoryReservationSchema,
} from './domain/inventory-reservation.js';
export type {
  InsufficientInventoryItem,
  InventoryReservation,
  InventoryReservationItem,
  RequestedInventoryItem,
} from './domain/inventory-reservation.js';
