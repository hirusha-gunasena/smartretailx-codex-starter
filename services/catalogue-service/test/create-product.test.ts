import type { CreateProductRequest } from '@smartretailx/api-contracts';
import { CreateProduct, ProductConflictError, ProductValidationError } from '../src/index.js';
import {
  CREATED_AT,
  FixedIdGenerator,
  PRODUCT_ID,
  AdjustableClock,
  createProductRequest,
  productFixture,
} from './support/fixtures.js';
import { InMemoryProductRepository } from './support/in-memory-product-repository.js';

describe('CreateProduct', () => {
  test('creates a valid product with the generated identity and timestamp', async () => {
    const useCase = new CreateProduct(
      new InMemoryProductRepository(),
      new FixedIdGenerator(),
      new AdjustableClock(),
    );

    await expect(useCase.execute(createProductRequest())).resolves.toEqual(productFixture());
  });

  test('stores the created product', async () => {
    const repository = new InMemoryProductRepository();
    const useCase = new CreateProduct(repository, new FixedIdGenerator(), new AdjustableClock());

    await useCase.execute(createProductRequest());

    await expect(repository.findById(PRODUCT_ID)).resolves.toEqual(productFixture());
  });

  test('rejects malformed input using the shared create-product schema', async () => {
    const useCase = new CreateProduct(
      new InMemoryProductRepository(),
      new FixedIdGenerator(),
      new AdjustableClock(),
    );
    const malformedRequest = {
      name: 'Wireless Keyboard',
      price: 79.99,
    } as unknown as CreateProductRequest;

    await expect(useCase.execute(malformedRequest)).rejects.toBeInstanceOf(ProductValidationError);
  });

  test('rejects a negative price', async () => {
    const useCase = new CreateProduct(
      new InMemoryProductRepository(),
      new FixedIdGenerator(),
      new AdjustableClock(),
    );

    await expect(useCase.execute(createProductRequest({ price: -0.01 }))).rejects.toBeInstanceOf(
      ProductValidationError,
    );
  });

  test('rejects a duplicate generated product ID with a typed conflict', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new CreateProduct(
      repository,
      new FixedIdGenerator(),
      new AdjustableClock(CREATED_AT),
    );

    await expect(useCase.execute(createProductRequest())).rejects.toEqual(
      expect.objectContaining({
        code: 'PRODUCT_CONFLICT',
        productId: PRODUCT_ID,
      }),
    );
    await expect(useCase.execute(createProductRequest())).rejects.toBeInstanceOf(
      ProductConflictError,
    );
  });
});
