import {
  GetOrder,
  InMemoryOrderRepository,
  OrderNotFoundError,
  OrderOwnershipMismatchError,
} from '../../src/index.js';
import type { VerifiedOrderCaller } from '../../src/index.js';
import { jest } from '@jest/globals';
import {
  ADMIN_CALLER,
  CUSTOMER_CALLER,
  ORDER_ID,
  OTHER_CUSTOMER_CALLER,
  orderFixture,
} from '../support/fixtures.js';

describe('GetOrder', () => {
  test('returns an existing order', async () => {
    const useCase = new GetOrder(new InMemoryOrderRepository([orderFixture()]));

    await expect(useCase.execute(ORDER_ID, CUSTOMER_CALLER)).resolves.toEqual(orderFixture());
  });

  test('throws OrderNotFoundError for a missing order', async () => {
    const useCase = new GetOrder(new InMemoryOrderRepository());

    await expect(useCase.execute(ORDER_ID, CUSTOMER_CALLER)).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  test('returns the same not-found family for a customer ownership mismatch', async () => {
    const useCase = new GetOrder(new InMemoryOrderRepository([orderFixture()]));

    await expect(useCase.execute(ORDER_ID, OTHER_CUSTOMER_CALLER)).rejects.toBeInstanceOf(
      OrderOwnershipMismatchError,
    );
  });

  test('allows an admin to read any existing customer order', async () => {
    const useCase = new GetOrder(new InMemoryOrderRepository([orderFixture()]));

    await expect(useCase.execute(ORDER_ID, ADMIN_CALLER)).resolves.toEqual(orderFixture());
  });

  test('denies an unsupported role before repository access', async () => {
    const repository = new InMemoryOrderRepository([orderFixture()]);
    const findById = jest.spyOn(repository, 'findById');
    const caller = {
      subject: 'opaque-subject',
      role: 'operator',
    } as unknown as VerifiedOrderCaller;

    await expect(new GetOrder(repository).execute(ORDER_ID, caller)).rejects.toThrow();
    expect(findById).not.toHaveBeenCalled();
  });
});
