import type { Product } from '@smartretailx/api-contracts';
import { ProductEntity } from '../../domain/product.js';
import type { ProductRepository } from '../ports/product-repository.js';

export class ListProducts {
  public constructor(private readonly repository: ProductRepository) {}

  public async execute(): Promise<readonly Product[]> {
    const products = await this.repository.list();

    return products.map((product) => ProductEntity.rehydrate(product).snapshot());
  }
}
