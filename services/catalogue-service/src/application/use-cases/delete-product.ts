import { ProductNotFoundError } from '../../domain/errors.js';
import type { ProductRepository } from '../ports/product-repository.js';

export class DeleteProduct {
  public constructor(private readonly repository: ProductRepository) {}

  public async execute(productId: string): Promise<true> {
    if (!(await this.repository.delete(productId))) {
      throw new ProductNotFoundError(productId);
    }

    return true;
  }
}
