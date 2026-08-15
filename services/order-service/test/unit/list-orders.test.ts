import { InMemoryOrderRepository, ListOrders } from '../../src/index.js';
import { jest } from '@jest/globals';
import {
  ADMIN_CALLER,
  CUSTOMER_CALLER,
  OTHER_CUSTOMER_ID,
  SECOND_ORDER_ID,
  orderFixture,
} from '../support/fixtures.js';

describe('ListOrders', () => {
  test('returns an empty order list', async () => {
    const useCase = new ListOrders(new InMemoryOrderRepository());

    await expect(useCase.execute(CUSTOMER_CALLER)).resolves.toEqual([]);
  });

  test('returns a populated order list', async () => {
    const orders = [orderFixture(), orderFixture({ orderId: SECOND_ORDER_ID })];
    const useCase = new ListOrders(new InMemoryOrderRepository(orders));

    await expect(useCase.execute(ADMIN_CALLER)).resolves.toEqual(orders);
  });

  test('isolates repository state from nested caller mutations', async () => {
    const repository = new InMemoryOrderRepository([orderFixture()]);
    const listedOrders = await new ListOrders(repository).execute(CUSTOMER_CALLER);

    listedOrders[0]!.items[0]!.unitPrice = 0;
    listedOrders[0]!.status = 'REJECTED';

    await expect(repository.findById(listedOrders[0]!.orderId)).resolves.toEqual(orderFixture());
  });

  test('customer list returns only the derived customer partition', async () => {
    const ownOrder = orderFixture();
    const otherOrder = orderFixture({
      orderId: SECOND_ORDER_ID,
      customerId: OTHER_CUSTOMER_ID,
    });
    const repository = new InMemoryOrderRepository([ownOrder, otherOrder]);
    const listAll = jest.spyOn(repository, 'listAll');
    const listByCustomerId = jest.spyOn(repository, 'listByCustomerId');

    await expect(new ListOrders(repository).execute(CUSTOMER_CALLER)).resolves.toEqual([ownOrder]);
    expect(listByCustomerId).toHaveBeenCalledWith(ownOrder.customerId);
    expect(listAll).not.toHaveBeenCalled();
  });

  test('admin list uses the complete-list access pattern and not the customer index', async () => {
    const repository = new InMemoryOrderRepository([orderFixture()]);
    const listAll = jest.spyOn(repository, 'listAll');
    const listByCustomerId = jest.spyOn(repository, 'listByCustomerId');

    await new ListOrders(repository).execute(ADMIN_CALLER);

    expect(listAll).toHaveBeenCalledTimes(1);
    expect(listByCustomerId).not.toHaveBeenCalled();
  });
});
