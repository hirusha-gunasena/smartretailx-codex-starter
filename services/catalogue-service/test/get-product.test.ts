import { GetProduct, ProductNotFoundError } from '../src/index.js';
import { PRODUCT_ID, productFixture } from './support/fixtures.js';
import { InMemoryProductRepository } from './support/in-memory-product-repository.js';

describe('GetProduct', () => {
  test('returns an existing product', async () => {
    const useCase = new GetProduct(new InMemoryProductRepository([productFixture()]));

    await expect(useCase.execute(PRODUCT_ID)).resolves.toEqual(productFixture());
  });

  test('throws ProductNotFoundError for an unknown product ID', async () => {
    const useCase = new GetProduct(new InMemoryProductRepository());

    await expect(useCase.execute(PRODUCT_ID)).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
