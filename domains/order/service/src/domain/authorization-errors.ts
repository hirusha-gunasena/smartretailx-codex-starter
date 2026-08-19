import { OrderNotFoundError, OrderServiceError } from './errors.js';

export type OrderAuthenticationReasonCode =
  'AUTH_INVALID_TOKEN' | 'AUTH_MISSING_SCOPE' | 'AUTH_MISSING_TOKEN' | 'AUTH_WRONG_TOKEN_USE';

export type OrderAuthorizationReasonCode = 'AUTH_INSUFFICIENT_ROLE' | 'AUTH_INVALID_GROUPS';

export class OrderAuthenticationError extends OrderServiceError {
  public constructor(public readonly reasonCode: OrderAuthenticationReasonCode) {
    super('Order caller authentication failed', 'UNAUTHORIZED');
  }
}

export class OrderAuthorizationError extends OrderServiceError {
  public constructor(public readonly reasonCode: OrderAuthorizationReasonCode) {
    super('Order caller authorization failed', 'FORBIDDEN');
  }
}

export class OrderOwnershipMismatchError extends OrderNotFoundError {
  public constructor(orderId: string) {
    super(orderId);
  }
}
