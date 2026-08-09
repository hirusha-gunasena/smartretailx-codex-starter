import type {
  ConfirmedOrder,
  CreateOrderRequest,
  PendingOrder,
  RejectedOrder,
} from '@smartretailx/api-contracts';
import type { Clock, IdGenerator } from '../../src/index.js';

export const ORDER_ID = '550e8400-e29b-41d4-a716-446655440010';
export const SECOND_ORDER_ID = '550e8400-e29b-41d4-a716-446655440011';
export const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440012';
export const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440013';
export const SECOND_PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440014';
export const CREATED_AT = '2026-08-09T08:30:00.000Z';
export const RESERVATION_ID = '550e8400-e29b-41d4-a716-446655440015';
export const REJECTION_REASON = 'INSUFFICIENT_STOCK';

export const createOrderRequest = (
  overrides: Partial<CreateOrderRequest> = {},
): CreateOrderRequest => ({
  customerId: CUSTOMER_ID,
  items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 79.99 }],
  currency: 'USD',
  ...overrides,
});

export const orderFixture = (overrides: Partial<PendingOrder> = {}): PendingOrder => ({
  orderId: ORDER_ID,
  customerId: CUSTOMER_ID,
  items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 79.99 }],
  totalAmount: 159.98,
  currency: 'USD',
  status: 'PENDING',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
});

export const confirmedOrderFixture = (overrides: Partial<ConfirmedOrder> = {}): ConfirmedOrder => ({
  ...orderFixture(),
  status: 'CONFIRMED',
  reservationId: RESERVATION_ID,
  ...overrides,
});

export const rejectedOrderFixture = (overrides: Partial<RejectedOrder> = {}): RejectedOrder => ({
  ...orderFixture(),
  status: 'REJECTED',
  rejectionReason: REJECTION_REASON,
  ...overrides,
});

export class FixedIdGenerator implements IdGenerator {
  public constructor(private readonly value: string = ORDER_ID) {}

  public generate(): string {
    return this.value;
  }
}

export class FixedClock implements Clock {
  public constructor(private readonly value: string = CREATED_AT) {}

  public now(): string {
    return this.value;
  }
}
