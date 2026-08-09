import { InMemoryOrderRepository, ListOrders } from '../../src/index.js';
import { SECOND_ORDER_ID, orderFixture } from '../support/fixtures.js';

describe('ListOrders', () => {
  test('returns an empty order list', async () => {
    const useCase = new ListOrders(new InMemoryOrderRepository());

    await expect(useCase.execute()).resolves.toEqual([]);
  });

  test('returns a populated order list', async () => {
    const orders = [orderFixture(), orderFixture({ orderId: SECOND_ORDER_ID })];
    const useCase = new ListOrders(new InMemoryOrderRepository(orders));

    await expect(useCase.execute()).resolves.toEqual(orders);
  });

  test('isolates repository state from nested caller mutations', async () => {
    const repository = new InMemoryOrderRepository([orderFixture()]);
    const listedOrders = await new ListOrders(repository).execute();

    listedOrders[0]!.items[0]!.unitPrice = 0;
    listedOrders[0]!.status = 'REJECTED';

    await expect(repository.findById(listedOrders[0]!.orderId)).resolves.toEqual(orderFixture());
  });
});
