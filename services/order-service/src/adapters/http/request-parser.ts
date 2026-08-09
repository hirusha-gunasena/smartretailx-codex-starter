import { createOrderRequestSchema, orderIdSchema } from '@smartretailx/api-contracts';
import type { CreateOrderRequest } from '@smartretailx/api-contracts';

export class HttpRequestError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export const parseCreateOrderRequest = (body: unknown): CreateOrderRequest => {
  const result = createOrderRequestSchema.safeParse(body);

  if (!result.success) {
    throw new HttpRequestError('VALIDATION_ERROR', 'The order request is invalid.');
  }

  return result.data;
};

export const parseOrderId = (value: string): string => {
  const result = orderIdSchema.safeParse(value);

  if (!result.success) {
    throw new HttpRequestError(
      'VALIDATION_ERROR',
      'The orderId path parameter must be a valid UUID.',
    );
  }

  return result.data;
};
