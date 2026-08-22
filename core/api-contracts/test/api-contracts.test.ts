import {
  apiErrorResponseSchema,
  createOrderBodySchema,
  createOrderRequestSchema,
  createApiSuccessResponseSchema,
  createProductRequestSchema,
  orderSchema,
  orderItemSchema,
  productSchema,
  updateProductRequestSchema,
} from '../src/index.js';

const productId = '550e8400-e29b-41d4-a716-446655440000';
const orderId = '550e8400-e29b-41d4-a716-446655440001';
const customerId = '550e8400-e29b-41d4-a716-446655440002';
const reservationId = '550e8400-e29b-41d4-a716-446655440003';
const timestamp = '2026-08-08T10:30:00.000Z';

describe('product API contracts', () => {
  test('accepts a valid product', () => {
    expect(
      productSchema.safeParse({
        productId,
        name: 'Wireless Keyboard',
        description: 'Compact mechanical keyboard',
        price: 79.99,
        currency: 'USD',
        imageUrl: 'https://assets.example.com/products/keyboard.png',
        createdAt: timestamp,
        updatedAt: timestamp,
      }).success,
    ).toBe(true);
  });

  test('accepts valid create and partial update requests', () => {
    expect(
      createProductRequestSchema.safeParse({
        name: 'Wireless Keyboard',
        price: 79.99,
        currency: 'USD',
      }).success,
    ).toBe(true);
    expect(updateProductRequestSchema.safeParse({ price: 69.99 }).success).toBe(true);
  });

  test('accepts a category and rejects descriptions over 1000 words', () => {
    expect(
      createProductRequestSchema.safeParse({
        name: 'Wireless Keyboard',
        category: 'Accessories',
        price: 79.99,
        currency: 'USD',
      }).success,
    ).toBe(true);
    expect(
      createProductRequestSchema.safeParse({
        name: 'Wireless Keyboard',
        description: Array.from({ length: 1_001 }, () => 'word').join(' '),
        price: 79.99,
        currency: 'USD',
      }).success,
    ).toBe(false);
  });

  test('rejects an empty update request', () => {
    expect(updateProductRequestSchema.safeParse({}).success).toBe(false);
  });

  test('rejects an order item with a non-positive quantity', () => {
    expect(orderItemSchema.safeParse({ productId, quantity: 0, unitPrice: 79.99 }).success).toBe(
      false,
    );
  });
});

describe('order API contracts', () => {
  const createRequest = {
    customerId,
    items: [{ productId, quantity: 2, unitPrice: 79.99 }],
    currency: 'USD',
  };
  const orderBase = {
    orderId,
    ...createRequest,
    totalAmount: 159.98,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  test('accepts a valid create-order request', () => {
    expect(createOrderRequestSchema.safeParse(createRequest).success).toBe(true);
  });

  test('accepts only client-controlled fields in the public create-order body', () => {
    const publicBody = { items: createRequest.items, currency: createRequest.currency };

    expect(createOrderBodySchema.safeParse(publicBody).success).toBe(true);
    expect(createOrderBodySchema.safeParse({ ...publicBody, customerId }).success).toBe(false);
  });

  test('accepts a valid order response', () => {
    expect(
      orderSchema.safeParse({
        ...orderBase,
        status: 'PENDING',
      }).success,
    ).toBe(true);
  });

  test('rejects PENDING with reservationId', () => {
    expect(orderSchema.safeParse({ ...orderBase, status: 'PENDING', reservationId }).success).toBe(
      false,
    );
  });

  test('rejects PENDING with rejectionReason', () => {
    expect(
      orderSchema.safeParse({
        ...orderBase,
        status: 'PENDING',
        rejectionReason: 'INSUFFICIENT_STOCK',
      }).success,
    ).toBe(false);
  });

  test('accepts CONFIRMED with a UUID reservationId', () => {
    expect(
      orderSchema.safeParse({ ...orderBase, status: 'CONFIRMED', reservationId }).success,
    ).toBe(true);
  });

  test('rejects CONFIRMED without reservationId', () => {
    expect(orderSchema.safeParse({ ...orderBase, status: 'CONFIRMED' }).success).toBe(false);
  });

  test('rejects CONFIRMED with an invalid reservationId', () => {
    expect(
      orderSchema.safeParse({
        ...orderBase,
        status: 'CONFIRMED',
        reservationId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  test('rejects CONFIRMED with rejectionReason', () => {
    expect(
      orderSchema.safeParse({
        ...orderBase,
        status: 'CONFIRMED',
        reservationId,
        rejectionReason: 'INSUFFICIENT_STOCK',
      }).success,
    ).toBe(false);
  });

  test('accepts REJECTED with a non-empty rejectionReason', () => {
    expect(
      orderSchema.safeParse({
        ...orderBase,
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_STOCK',
      }).success,
    ).toBe(true);
  });

  test('rejects REJECTED without rejectionReason', () => {
    expect(orderSchema.safeParse({ ...orderBase, status: 'REJECTED' }).success).toBe(false);
  });

  test('rejects REJECTED with an empty rejectionReason', () => {
    expect(
      orderSchema.safeParse({ ...orderBase, status: 'REJECTED', rejectionReason: '   ' }).success,
    ).toBe(false);
  });

  test('rejects REJECTED with reservationId', () => {
    expect(
      orderSchema.safeParse({
        ...orderBase,
        status: 'REJECTED',
        rejectionReason: 'INSUFFICIENT_STOCK',
        reservationId,
      }).success,
    ).toBe(false);
  });

  test('rejects empty orders and malformed identifiers', () => {
    expect(createOrderRequestSchema.safeParse({ ...createRequest, items: [] }).success).toBe(false);
    expect(
      createOrderRequestSchema.safeParse({ ...createRequest, customerId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  test('rejects protected server-managed fields in create requests', () => {
    expect(
      createOrderRequestSchema.safeParse({
        ...createRequest,
        orderId,
        status: 'CONFIRMED',
        totalAmount: 0,
        createdAt: timestamp,
        reservationId,
        rejectionReason: 'INSUFFICIENT_STOCK',
      }).success,
    ).toBe(false);
  });
});

describe('standard API responses', () => {
  test('validates a typed success response', () => {
    const schema = createApiSuccessResponseSchema(productSchema);

    expect(
      schema.safeParse({
        success: true,
        data: {
          productId,
          name: 'Wireless Keyboard',
          price: 79.99,
          currency: 'USD',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        requestId: 'request-123',
      }).success,
    ).toBe(true);
  });

  test('validates a standard error response', () => {
    expect(
      apiErrorResponseSchema.safeParse({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request payload is invalid',
        },
        requestId: 'request-123',
      }).success,
    ).toBe(true);
  });
});
