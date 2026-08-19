import { OrderAuthenticationError, OrderAuthorizationError } from '../../src/index.js';
import type {
  OrderAuthorizationTelemetry,
  OrderAuthorizationTelemetryEntry,
  OrderCallerAuthenticator,
  VerifiedOrderCaller,
} from '../../src/index.js';
import { ADMIN_CALLER, CUSTOMER_CALLER, OTHER_CUSTOMER_CALLER } from './fixtures.js';

export const CUSTOMER_AUTHORIZATION = 'Bearer customer-test-token';
export const ADMIN_AUTHORIZATION = 'Bearer admin-test-token';
export const OTHER_CUSTOMER_AUTHORIZATION = 'Bearer other-customer-test-token';

export class TestOrderCallerAuthenticator implements OrderCallerAuthenticator {
  public async authenticate(authorizationHeader: string | undefined): Promise<VerifiedOrderCaller> {
    if (authorizationHeader === CUSTOMER_AUTHORIZATION) {
      return CUSTOMER_CALLER;
    }
    if (authorizationHeader === ADMIN_AUTHORIZATION) {
      return ADMIN_CALLER;
    }
    if (authorizationHeader === OTHER_CUSTOMER_AUTHORIZATION) {
      return OTHER_CUSTOMER_CALLER;
    }
    if (authorizationHeader === 'Bearer invalid-groups-test-token') {
      throw new OrderAuthorizationError('AUTH_INVALID_GROUPS');
    }
    if (authorizationHeader === undefined) {
      throw new OrderAuthenticationError('AUTH_MISSING_TOKEN');
    }
    throw new OrderAuthenticationError('AUTH_INVALID_TOKEN');
  }
}

export class CapturingOrderAuthorizationTelemetry implements OrderAuthorizationTelemetry {
  public readonly entries: OrderAuthorizationTelemetryEntry[] = [];

  public record(entry: OrderAuthorizationTelemetryEntry): void {
    this.entries.push(entry);
  }
}
