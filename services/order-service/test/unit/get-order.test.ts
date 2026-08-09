import { GetOrder, InMemoryOrderRepository, OrderNotFoundError } from '../../src/index.js';
import { ORDER_ID, orderFixture } from '../support/fixtures.js';

describe('GetOrder', () => {
  test('returns an existing order', async () => {
    const useCase = new GetOrder(new InMemoryOrderRepository([orderFixture()]));

    await expect(useCase.execute(ORDER_ID)).resolves.toEqual(orderFixture());
  });

  test('throws OrderNotFoundError for a missing order', async () => {
    const useCase = new GetOrder(new InMemoryOrderRepository());

    await expect(useCase.execute(ORDER_ID)).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
