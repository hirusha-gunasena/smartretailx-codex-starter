import type { Product, UpdateProductRequest } from '@smartretailx/api-contracts';
import { ProductNotFoundError } from '../../domain/errors.js';
import { ProductEntity } from '../../domain/product.js';
import type { Clock } from '../ports/clock.js';
import type { ProductRepository } from '../ports/product-repository.js';

export class UpdateProduct {
  public constructor(
    private readonly repository: ProductRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(productId: string, request: UpdateProductRequest): Promise<Product> {
    const existingProduct = await this.repository.findById(productId);

    if (existingProduct === null) {
      throw new ProductNotFoundError(productId);
    }

    const updatedProduct = ProductEntity.rehydrate(existingProduct)
      .update(request, this.clock.now())
      .snapshot();

    if (!(await this.repository.update(updatedProduct))) {
      throw new ProductNotFoundError(productId);
    }

    return { ...updatedProduct };
  }
}
