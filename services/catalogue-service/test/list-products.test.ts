import { ListProducts } from '../src/index.js';
import { SECOND_PRODUCT_ID, productFixture } from './support/fixtures.js';
import { InMemoryProductRepository } from './support/in-memory-product-repository.js';

describe('ListProducts', () => {
  test('returns all products', async () => {
    const products = [productFixture(), productFixture({ productId: SECOND_PRODUCT_ID })];
    const useCase = new ListProducts(new InMemoryProductRepository(products));

    await expect(useCase.execute()).resolves.toEqual(products);
  });

  test('returns an empty list safely', async () => {
    const useCase = new ListProducts(new InMemoryProductRepository());

    await expect(useCase.execute()).resolves.toEqual([]);
  });

  test('does not expose mutable repository references', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new ListProducts(repository);
    const listedProducts = await useCase.execute();

    listedProducts[0]!.name = 'Mutated outside the repository';

    await expect(repository.findById(listedProducts[0]!.productId)).resolves.toEqual(
      productFixture(),
    );
  });
});
