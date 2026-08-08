import { DeleteProduct, GetProduct, ProductNotFoundError } from '../src/index.js';
import { PRODUCT_ID, productFixture } from './support/fixtures.js';
import { InMemoryProductRepository } from './support/in-memory-product-repository.js';

describe('DeleteProduct', () => {
  test('deletes an existing product and returns true', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new DeleteProduct(repository);

    await expect(useCase.execute(PRODUCT_ID)).resolves.toBe(true);
  });

  test('removes the product from subsequent reads', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const deleteProduct = new DeleteProduct(repository);
    const getProduct = new GetProduct(repository);

    await deleteProduct.execute(PRODUCT_ID);

    await expect(getProduct.execute(PRODUCT_ID)).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  test('throws ProductNotFoundError for an unknown product ID', async () => {
    const useCase = new DeleteProduct(new InMemoryProductRepository());

    await expect(useCase.execute(PRODUCT_ID)).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
