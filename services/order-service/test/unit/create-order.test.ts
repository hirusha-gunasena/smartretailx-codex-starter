import type { CreateOrderRequest } from '@smartretailx/api-contracts';
import { CreateOrder, InMemoryOrderRepository, OrderValidationError } from '../../src/index.js';
import {
  CREATED_AT,
  CUSTOMER_ID,
  FixedClock,
  FixedIdGenerator,
  ORDER_ID,
  PRODUCT_ID,
  SECOND_PRODUCT_ID,
  createOrderRequest,
  orderFixture,
} from '../support/fixtures.js';

const createUseCase = (repository = new InMemoryOrderRepository()): CreateOrder =>
  new CreateOrder(repository, new FixedIdGenerator(), new FixedClock());

describe('CreateOrder', () => {
  test('creates a valid order', async () => {
    await expect(createUseCase().execute(createOrderRequest())).resolves.toEqual(orderFixture());
  });

  test('uses the injected deterministic order ID', async () => {
    const order = await createUseCase().execute(createOrderRequest());

    expect(order.orderId).toBe(ORDER_ID);
  });

  test('sets every new order to PENDING', async () => {
    const order = await createUseCase().execute(createOrderRequest());

    expect(order.status).toBe('PENDING');
  });

  test('calculates totals with scaled decimal arithmetic', async () => {
    const order = await createUseCase().execute(
      createOrderRequest({
        items: [
          { productId: PRODUCT_ID, quantity: 3, unitPrice: 0.1 },
          { productId: SECOND_PRODUCT_ID, quantity: 1, unitPrice: 0.2 },
        ],
      }),
    );

    expect(order.totalAmount).toBe(0.5);
  });

  test('stores the created order', async () => {
    const repository = new InMemoryOrderRepository();
    await createUseCase(repository).execute(createOrderRequest());

    await expect(repository.findById(ORDER_ID)).resolves.toEqual(orderFixture());
  });

  test('rejects an empty item list', async () => {
    await expect(createUseCase().execute(createOrderRequest({ items: [] }))).rejects.toBeInstanceOf(
      OrderValidationError,
    );
  });

  test('rejects an invalid customer ID', async () => {
    await expect(
      createUseCase().execute(createOrderRequest({ customerId: 'not-a-uuid' })),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test('rejects an invalid product ID', async () => {
    await expect(
      createUseCase().execute(
        createOrderRequest({
          items: [{ productId: 'not-a-uuid', quantity: 1, unitPrice: 10 }],
        }),
      ),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test.each([0, -1, 1.5])('rejects invalid quantity %s', async (quantity) => {
    await expect(
      createUseCase().execute(
        createOrderRequest({
          items: [{ productId: PRODUCT_ID, quantity, unitPrice: 10 }],
        }),
      ),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test('rejects a negative unit price', async () => {
    await expect(
      createUseCase().execute(
        createOrderRequest({
          items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: -0.01 }],
        }),
      ),
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  test('handles multiple items and quantities', async () => {
    const order = await createUseCase().execute(
      createOrderRequest({
        items: [
          { productId: PRODUCT_ID, quantity: 3, unitPrice: 12.34 },
          { productId: SECOND_PRODUCT_ID, quantity: 1, unitPrice: 0.1 },
        ],
      }),
    );

    expect(order.totalAmount).toBeCloseTo(37.12, 10);
  });

  test('preserves the injected timestamp for createdAt and updatedAt', async () => {
    const order = await createUseCase().execute(createOrderRequest());

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
    } as unknown as CreateOrderRequest;

    await expect(createUseCase().execute(request)).rejects.toBeInstanceOf(OrderValidationError);
  });
});
