import type {
  ConfirmedOrder,
  CreateOrderBody,
  CreateOrderRequest,
  PendingOrder,
  RejectedOrder,
} from '@smartretailx/api-contracts';
import type { Clock, IdGenerator, VerifiedOrderCaller } from '../../src/index.js';

export const ORDER_ID = '550e8400-e29b-41d4-a716-446655440010';
export const SECOND_ORDER_ID = '550e8400-e29b-41d4-a716-446655440011';
export const CUSTOMER_SUBJECT = 'opaque-customer-subject';
export const OTHER_CUSTOMER_SUBJECT = 'other-customer-subject';
export const CUSTOMER_ID = 'e3a28252-e413-5d5b-87ac-b2e04d75a62f';
export const OTHER_CUSTOMER_ID = '21edc522-131e-5be5-870a-911b2dfa4fbe';
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

export const createOrderBody = (overrides: Partial<CreateOrderBody> = {}): CreateOrderBody => ({
  items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 79.99 }],
  currency: 'USD',
  ...overrides,
});

export const CUSTOMER_CALLER: VerifiedOrderCaller = {
  subject: CUSTOMER_SUBJECT,
  role: 'customer',
};

export const OTHER_CUSTOMER_CALLER: VerifiedOrderCaller = {
  subject: OTHER_CUSTOMER_SUBJECT,
  role: 'customer',
};

export const ADMIN_CALLER: VerifiedOrderCaller = {
  subject: 'opaque-admin-subject',
  role: 'admin',
};

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
