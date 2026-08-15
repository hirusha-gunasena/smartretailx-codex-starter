import type { OrderRole } from './order-caller-authenticator.js';

export type OrderAuthorizationReasonCode =
  | 'AUTH_ALLOWED'
  | 'AUTH_INSUFFICIENT_ROLE'
  | 'AUTH_INVALID_GROUPS'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_MISSING_SCOPE'
  | 'AUTH_MISSING_TOKEN'
  | 'AUTH_OWNERSHIP_MISMATCH'
  | 'AUTH_WRONG_TOKEN_USE';

export interface OrderAuthorizationTelemetryEntry {
  readonly event: 'order.authorization';
  readonly method: string;
  readonly route: string;
  readonly decision: 'ALLOW' | 'DENY';
  readonly reasonCode: OrderAuthorizationReasonCode;
  readonly tokenUse: 'access' | 'unknown';
  readonly subjectPresent: boolean;
  readonly scopePresent: boolean;
  readonly role?: OrderRole;
}

export interface OrderAuthorizationTelemetry {
  record(entry: OrderAuthorizationTelemetryEntry): void;
}
