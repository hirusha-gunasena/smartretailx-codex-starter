import type { UpdateProductRequest } from '@smartretailx/api-contracts';
import { ProductNotFoundError, ProductValidationError, UpdateProduct } from '../src/index.js';
import {
  CREATED_AT,
  PRODUCT_ID,
  UPDATED_AT,
  AdjustableClock,
  productFixture,
} from './support/fixtures.js';
import { InMemoryProductRepository } from './support/in-memory-product-repository.js';

describe('UpdateProduct', () => {
  test('updates permitted product fields', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(UPDATED_AT));

    await expect(
      useCase.execute(PRODUCT_ID, {
        name: 'Ergonomic Keyboard',
        description: 'Split ergonomic keyboard',
        price: 99.99,
        currency: 'EUR',
        imageUrl: 'https://assets.example.com/products/ergonomic-keyboard.png',
      }),
    ).resolves.toEqual(
      productFixture({
        name: 'Ergonomic Keyboard',
        description: 'Split ergonomic keyboard',
        price: 99.99,
        currency: 'EUR',
        imageUrl: 'https://assets.example.com/products/ergonomic-keyboard.png',
        updatedAt: UPDATED_AT,
      }),
    );
  });

  test('preserves productId and createdAt while changing updatedAt', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(UPDATED_AT));

    const updated = await useCase.execute(PRODUCT_ID, { price: 69.99 });

    expect(updated.productId).toBe(PRODUCT_ID);
    expect(updated.createdAt).toBe(CREATED_AT);
    expect(updated.updatedAt).toBe(UPDATED_AT);
  });

  test('ensures updatedAt advances when the clock has not advanced', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(CREATED_AT));

    const updated = await useCase.execute(PRODUCT_ID, { price: 69.99 });

    expect(updated.updatedAt).toBe('2026-08-08T10:30:00.001Z');
  });

  test('preserves omitted values during a partial update', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(UPDATED_AT));

    const updated = await useCase.execute(PRODUCT_ID, { price: 69.99 });

    expect(updated).toEqual(productFixture({ price: 69.99, updatedAt: UPDATED_AT }));
  });

  test('rejects a negative price', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(UPDATED_AT));

    await expect(useCase.execute(PRODUCT_ID, { price: -1 })).rejects.toBeInstanceOf(
      ProductValidationError,
    );
  });

  test('rejects an empty name', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(UPDATED_AT));

    await expect(useCase.execute(PRODUCT_ID, { name: '   ' })).rejects.toBeInstanceOf(
      ProductValidationError,
    );
  });

  test('rejects attempts to change stable contract fields', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(UPDATED_AT));
    const request = {
      price: 69.99,
      productId: '550e8400-e29b-41d4-a716-446655440009',
      createdAt: UPDATED_AT,
    } as unknown as UpdateProductRequest;

    await expect(useCase.execute(PRODUCT_ID, request)).rejects.toBeInstanceOf(
      ProductValidationError,
    );
  });

  test('throws ProductNotFoundError for an unknown product ID', async () => {
    const useCase = new UpdateProduct(
      new InMemoryProductRepository(),
      new AdjustableClock(UPDATED_AT),
    );

    await expect(useCase.execute(PRODUCT_ID, { price: 69.99 })).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  test('does not persist later mutations to the returned product', async () => {
    const repository = new InMemoryProductRepository([productFixture()]);
    const useCase = new UpdateProduct(repository, new AdjustableClock(UPDATED_AT));
    const updated = await useCase.execute(PRODUCT_ID, { price: 69.99 });

    updated.name = 'Mutated outside the repository';

    await expect(repository.findById(PRODUCT_ID)).resolves.toEqual(
      productFixture({ price: 69.99, updatedAt: UPDATED_AT }),
    );
  });
});
