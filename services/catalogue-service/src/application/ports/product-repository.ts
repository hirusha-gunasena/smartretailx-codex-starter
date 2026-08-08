import type { Product } from '@smartretailx/api-contracts';

/**
 * Storage-agnostic persistence boundary for catalogue products.
 * Implementations return and retain value copies rather than shared mutable objects.
 */
export interface ProductRepository {
  create(product: Product): Promise<boolean>;
  findById(productId: string): Promise<Product | null>;
  list(): Promise<readonly Product[]>;
  update(product: Product): Promise<boolean>;
  delete(productId: string): Promise<boolean>;
}
