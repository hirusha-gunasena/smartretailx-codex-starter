import type { Product } from '@smartretailx/api-contracts';
import type { ProductRepository } from '../../src/index.js';

const copyProduct = (product: Product): Product => ({ ...product });

export class InMemoryProductRepository implements ProductRepository {
  private readonly products = new Map<string, Product>();

  public constructor(products: readonly Product[] = []) {
    for (const product of products) {
      this.products.set(product.productId, copyProduct(product));
    }
  }

  public async create(product: Product): Promise<boolean> {
    if (this.products.has(product.productId)) {
      return false;
    }

    this.products.set(product.productId, copyProduct(product));
    return true;
  }

  public async findById(productId: string): Promise<Product | null> {
    const product = this.products.get(productId);
    return product === undefined ? null : copyProduct(product);
  }

  public async list(): Promise<readonly Product[]> {
    return [...this.products.values()].map(copyProduct);
  }

  public async update(product: Product): Promise<boolean> {
    if (!this.products.has(product.productId)) {
      return false;
    }

    this.products.set(product.productId, copyProduct(product));
    return true;
  }

  public async delete(productId: string): Promise<boolean> {
    return this.products.delete(productId);
  }
}
