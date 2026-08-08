import type { CreateProductRequest, Product } from '@smartretailx/api-contracts';
import type { Clock, IdGenerator } from '../../src/index.js';

export const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';
export const SECOND_PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';
export const CREATED_AT = '2026-08-08T10:30:00.000Z';
export const UPDATED_AT = '2026-08-08T11:30:00.000Z';

export const createProductRequest = (
  overrides: Partial<CreateProductRequest> = {},
): CreateProductRequest => ({
  name: 'Wireless Keyboard',
  description: 'Compact mechanical keyboard',
  price: 79.99,
  currency: 'USD',
  imageUrl: 'https://assets.example.com/products/keyboard.png',
  ...overrides,
});

export const productFixture = (overrides: Partial<Product> = {}): Product => ({
  productId: PRODUCT_ID,
  name: 'Wireless Keyboard',
  description: 'Compact mechanical keyboard',
  price: 79.99,
  currency: 'USD',
  imageUrl: 'https://assets.example.com/products/keyboard.png',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
});

export class FixedIdGenerator implements IdGenerator {
  public constructor(private readonly value: string = PRODUCT_ID) {}

  public generate(): string {
    return this.value;
  }
}

export class AdjustableClock implements Clock {
  public constructor(private value: string = CREATED_AT) {}

  public now(): string {
    return this.value;
  }

  public set(value: string): void {
    this.value = value;
  }
}
