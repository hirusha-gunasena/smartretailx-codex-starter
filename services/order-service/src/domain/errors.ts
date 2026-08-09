export interface OrderValidationIssue {
  readonly path: string;
  readonly message: string;
}

export abstract class OrderServiceError extends Error {
  protected constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class OrderValidationError extends OrderServiceError {
  public constructor(public readonly issues: readonly OrderValidationIssue[]) {
    super('Order validation failed', 'ORDER_VALIDATION_FAILED');
  }
}

export class OrderNotFoundError extends OrderServiceError {
  public constructor(public readonly orderId: string) {
    super(`Order '${orderId}' was not found`, 'ORDER_NOT_FOUND');
  }
}

export class OrderConflictError extends OrderServiceError {
  public constructor(public readonly orderId: string) {
    super(`Order '${orderId}' already exists`, 'ORDER_CONFLICT');
  }
}
