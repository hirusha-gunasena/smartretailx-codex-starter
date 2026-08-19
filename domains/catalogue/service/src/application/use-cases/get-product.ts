import type { Product } from '@smartretailx/api-contracts';
import { ProductNotFoundError } from '../../domain/errors.js';
import { ProductEntity } from '../../domain/product.js';
import type { ProductRepository } from '../ports/product-repository.js';

export class GetProduct {
  public constructor(private readonly repository: ProductRepository) {}

  public async execute(productId: string): Promise<Product> {
    const product = await this.repository.findById(productId);

    if (product === null) {
      throw new ProductNotFoundError(productId);
    }

    return ProductEntity.rehydrate(product).snapshot();
  }
}
