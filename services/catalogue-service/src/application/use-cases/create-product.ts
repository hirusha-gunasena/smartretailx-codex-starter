import type { CreateProductRequest, Product } from '@smartretailx/api-contracts';
import { ProductConflictError } from '../../domain/errors.js';
import { ProductEntity } from '../../domain/product.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProductRepository } from '../ports/product-repository.js';

export class CreateProduct {
  public constructor(
    private readonly repository: ProductRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(request: CreateProductRequest): Promise<Product> {
    const product = ProductEntity.create(
      request,
      this.idGenerator.generate(),
      this.clock.now(),
    ).snapshot();

    if (!(await this.repository.create(product))) {
      throw new ProductConflictError(product.productId);
    }

    return { ...product };
  }
}
