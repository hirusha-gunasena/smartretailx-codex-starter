import type {
  SagaSuccessTelemetryEntry,
  SagaTelemetry,
} from '../../application/ports/saga-telemetry.js';

export class ConsoleSagaTelemetry implements SagaTelemetry {
  public recordSuccess(entry: SagaSuccessTelemetryEntry): void {
    try {
      console.info(JSON.stringify(entry));
    } catch {
      // Telemetry must never turn a completed business action into a retried event.
    }
  }
}
