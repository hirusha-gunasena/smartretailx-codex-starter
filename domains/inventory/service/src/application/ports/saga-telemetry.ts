export type InventorySagaStage = 'INVENTORY_OUTCOME_RELAY' | 'INVENTORY_RESERVATION';

export type InventorySagaOutcome = 'DUPLICATE' | 'PUBLISHED' | 'REJECTED' | 'RESERVED';

export interface SagaSuccessTelemetryEntry {
  readonly event: 'saga.success';
  readonly stage: InventorySagaStage;
  readonly outcome: InventorySagaOutcome;
  readonly requestId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly orderId: string;
}

export interface SagaTelemetry {
  recordSuccess(entry: SagaSuccessTelemetryEntry): void;
}

export interface SagaInvocationContext {
  readonly awsRequestId: string;
}
