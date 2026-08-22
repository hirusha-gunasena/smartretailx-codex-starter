export type OrderSagaStage = 'ORDER_LIFECYCLE_RELAY' | 'ORDER_WORKFLOW';

export type OrderSagaOutcome = 'ALREADY_APPLIED' | 'PUBLISHED' | 'UPDATED';

export interface SagaSuccessTelemetryEntry {
  readonly event: 'saga.success';
  readonly stage: OrderSagaStage;
  readonly outcome: OrderSagaOutcome;
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
