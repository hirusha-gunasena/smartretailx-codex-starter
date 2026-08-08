export type { Clock } from './application/ports/clock.js';
export type { IdGenerator } from './application/ports/id-generator.js';
export type { ProductRepository } from './application/ports/product-repository.js';

export { CreateProduct } from './application/use-cases/create-product.js';
export { DeleteProduct } from './application/use-cases/delete-product.js';
export { GetProduct } from './application/use-cases/get-product.js';
export { ListProducts } from './application/use-cases/list-products.js';
export { UpdateProduct } from './application/use-cases/update-product.js';

export {
  CatalogueError,
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from './domain/errors.js';
export type { ProductValidationIssue } from './domain/errors.js';
export { ProductEntity } from './domain/product.js';

export { RandomUuidGenerator, SystemClock } from './runtime/system-dependencies.js';
