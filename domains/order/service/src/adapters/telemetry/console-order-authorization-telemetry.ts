import type {
  OrderAuthorizationTelemetry,
  OrderAuthorizationTelemetryEntry,
} from '../../application/ports/order-authorization-telemetry.js';

export class ConsoleOrderAuthorizationTelemetry implements OrderAuthorizationTelemetry {
  public record(entry: OrderAuthorizationTelemetryEntry): void {
    console.info(JSON.stringify(entry));
  }
}
