import type { CreateOrderBody } from '@smartretailx/api-contracts';
import { jest } from '@jest/globals';
import type { VerifiedOrderCaller } from '../../src/index.js';
import {
  CreateOrder,
  InMemoryOrderRepository,
  OrderAuthorizationError,
  OrderValidationError,
} from '../../src/index.js';
import {
  ADMIN_CALLER,
  CREATED_AT,
  CUSTOMER_CALLER,
  CUSTOMER_ID,
  FixedClock,
  FixedIdGenerator,
  ORDER_ID,
  PRODUCT_ID,
  SECOND_PRODUCT_ID,
  createOrderBody,
  orderFixture,
} from '../support/fixtures.js';

const createUseCase = (repository = new InMemoryOrderRepository()): CreateOrder =>
  new CreateOrder(repository, new FixedIdGenerator(), new FixedClock());

describe('CreateOrder', () => {
  test('creates a valid order', async () => {
    await expect(createUseCase().execute(createOrderBody(), CUSTOMER_CALLER)).resolves.toEqual(
      orderFixture(),
    );
  });

  test('uses the injected deterministic order ID', async () => {
    const order = await createUseCase().execute(createOrderBody(), CUSTOMER_CALLER);

    expect(order.orderId).toBe(ORDER_ID);
  });

  test('sets every new order to PENDING', async () => {
    const order = await createUseCase().execute(createOrderBody(), CUSTOMER_CALLER);

    expect(order.status).toBe('PENDING');
    expect(order).not.toHaveProperty('reservationId');
    expect(order).not.toHaveProperty('rejectionReason');
  });

  test('calculates totals with scaled decimal arithmetic', async () => {
    const order = await createUseCase().execute(
      createOrderBody({
        items: [
          { productId: PRODUCT_ID, quantity: 3, unitPrice: 0.1 },
          { productId: SECOND_PRODUCT_ID, quantity: 1, unitPrice: 0.2 },
        ],
      }),
      CUSTOMER_CALLER,
    );

    expect(order.totalAmount).toBe(0.5);
  });

  test('stores the created order', async () => {
    const repository = new InMemoryOrderRepository();
    await createUseCase(repository).execute(createOrderBody(), CUSTOMER_CALLER);

    await expect(repository.findById(ORDER_ID)).resolves.toEqual(orderFixture());
  });

  test('rejects an empty item list', async () => {
    await expect(
      createUseCase().execute(createOrderBody({ items: [] }), CUSTOMER_CALLER),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test('rejects an invalid product ID', async () => {
    await expect(
      createUseCase().execute(
        createOrderBody({
          items: [{ productId: 'not-a-uuid', quantity: 1, unitPrice: 10 }],
        }),
        CUSTOMER_CALLER,
      ),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test.each([0, -1, 1.5])('rejects invalid quantity %s', async (quantity) => {
    await expect(
      createUseCase().execute(
        createOrderBody({
          items: [{ productId: PRODUCT_ID, quantity, unitPrice: 10 }],
        }),
        CUSTOMER_CALLER,
      ),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test('rejects a negative unit price', async () => {
    await expect(
      createUseCase().execute(
        createOrderBody({
          items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: -0.01 }],
        }),
        CUSTOMER_CALLER,
      ),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test('handles multiple items and quantities', async () => {
    const order = await createUseCase().execute(
      createOrderBody({
        items: [
          { productId: PRODUCT_ID, quantity: 3, unitPrice: 12.34 },
          { productId: SECOND_PRODUCT_ID, quantity: 1, unitPrice: 0.1 },
        ],
      }),
      CUSTOMER_CALLER,
    );

    expect(order.totalAmount).toBeCloseTo(37.12, 10);
  });

  test('preserves the injected timestamp for createdAt and updatedAt', async () => {
    const order = await createUseCase().execute(createOrderBody(), CUSTOMER_CALLER);

    expect(order.createdAt).toBe(CREATED_AT);
    expect(order.updatedAt).toBe(CREATED_AT);
  });

  test('rejects protected fields even across the application boundary', async () => {
    const request = {
      customerId: CUSTOMER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 10 }],
      currency: 'USD',
      totalAmount: 0,
      status: 'CONFIRMED',
      reservationId: '550e8400-e29b-41d4-a716-446655440015',
      rejectionReason: 'INSUFFICIENT_STOCK',
    } as unknown as CreateOrderBody;

    await expect(createUseCase().execute(request, CUSTOMER_CALLER)).rejects.toBeInstanceOf(
      OrderValidationError,
    );
  });

  test('derives customerId from the authenticated customer subject', async () => {
    const order = await createUseCase().execute(createOrderBody(), CUSTOMER_CALLER);

    expect(order.customerId).toBe(CUSTOMER_ID);
  });

  test('denies admin creation before persistence', async () => {
    const repository = new InMemoryOrderRepository();
    const create = jest.spyOn(repository, 'create');
    await expect(
      createUseCase(repository).execute(createOrderBody(), ADMIN_CALLER),
    ).rejects.toBeInstanceOf(OrderAuthorizationError);
    expect(create).not.toHaveBeenCalled();
  });

  test('denies a non-supported role before persistence as defense in depth', async () => {
    const repository = new InMemoryOrderRepository();
    const create = jest.spyOn(repository, 'create');
    const unsupportedCaller = {
      subject: 'opaque-subject',
      role: 'operator',
    } as unknown as VerifiedOrderCaller;

    await expect(
      createUseCase(repository).execute(createOrderBody(), unsupportedCaller),
    ).rejects.toBeInstanceOf(OrderAuthorizationError);
    expect(create).not.toHaveBeenCalled();
  });
});
