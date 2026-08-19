import { createCatalogueHandler } from '../adapters/http/catalogue-handler.js';
import type { CatalogueHandler, CatalogueUseCases } from '../adapters/http/catalogue-handler.js';
import type { AuthorizationDecisionLogger } from '../adapters/http/authorization.js';
import type { Clock } from '../application/ports/clock.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { ProductRepository } from '../application/ports/product-repository.js';
import { CreateProduct } from '../application/use-cases/create-product.js';
import { DeleteProduct } from '../application/use-cases/delete-product.js';
import { GetProduct } from '../application/use-cases/get-product.js';
import { ListProducts } from '../application/use-cases/list-products.js';
import { UpdateProduct } from '../application/use-cases/update-product.js';

export const createCatalogueUseCases = (
  repository: ProductRepository,
  idGenerator: IdGenerator,
  clock: Clock,
): CatalogueUseCases => ({
  createProduct: new CreateProduct(repository, idGenerator, clock),
  getProduct: new GetProduct(repository),
  listProducts: new ListProducts(repository),
  updateProduct: new UpdateProduct(repository, clock),
  deleteProduct: new DeleteProduct(repository),
});

export const composeCatalogueHandler = (
  repository: ProductRepository,
  idGenerator: IdGenerator,
  clock: Clock,
  authorizationLogger?: AuthorizationDecisionLogger,
): CatalogueHandler =>
  createCatalogueHandler(
    createCatalogueUseCases(repository, idGenerator, clock),
    authorizationLogger,
  );
