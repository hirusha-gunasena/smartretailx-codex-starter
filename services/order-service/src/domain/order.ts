import { createOrderRequestSchema, orderSchema } from '@smartretailx/api-contracts';
import type { CreateOrderRequest, Order, OrderItem } from '@smartretailx/api-contracts';
import { OrderValidationError } from './errors.js';
import { calculateOrderTotal } from './money.js';
import { ORDER_STATUS } from './order-status.js';

const toValidationError = (issues: readonly { path: readonly PropertyKey[]; message: string }[]) =>
  new OrderValidationError(
    issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );

const parseCreateRequest = (value: CreateOrderRequest): CreateOrderRequest => {
  const result = createOrderRequestSchema.safeParse(value);

  if (!result.success) {
    throw toValidationError(result.error.issues);
  }

  return result.data;
};

const parseOrder = (value: unknown): Order => {
  const result = orderSchema.safeParse(value);

  if (!result.success) {
    throw toValidationError(result.error.issues);
  }

  return result.data;
};

const copyItems = (items: readonly OrderItem[]): OrderItem[] => items.map((item) => ({ ...item }));

export const copyOrder = (order: Order): Order => ({
  ...order,
  items: copyItems(order.items),
});

export class OrderEntity {
  private readonly state: Order;

  private constructor(order: Order) {
    const state = copyOrder(order);
    for (const item of state.items) {
      Object.freeze(item);
    }
    Object.freeze(state.items);
    this.state = Object.freeze(state);
  }

  public static create(
    request: CreateOrderRequest,
    orderId: string,
    timestamp: string,
  ): OrderEntity {
    const input = parseCreateRequest(request);
    const order = parseOrder({
      orderId,
      customerId: input.customerId,
      items: copyItems(input.items),
      totalAmount: calculateOrderTotal(input.items),
      currency: input.currency,
      status: ORDER_STATUS.PENDING,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return new OrderEntity(order);
  }

  public static rehydrate(order: Order): OrderEntity {
    return new OrderEntity(parseOrder(order));
  }

  public snapshot(): Order {
    return copyOrder(this.state);
  }
}
