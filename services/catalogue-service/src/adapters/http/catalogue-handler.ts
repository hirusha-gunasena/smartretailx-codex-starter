import type {
  CreateProductRequest,
  Product,
  UpdateProductRequest,
} from '@smartretailx/api-contracts';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { CreateProduct } from '../../application/use-cases/create-product.js';
import type { DeleteProduct } from '../../application/use-cases/delete-product.js';
import type { GetProduct } from '../../application/use-cases/get-product.js';
import type { ListProducts } from '../../application/use-cases/list-products.js';
import type { UpdateProduct } from '../../application/use-cases/update-product.js';
import {
  parseCreateProductRequest,
  parseProductId,
  parseUpdateProductRequest,
} from './request-parser.js';
import {
  errorResponse,
  mapErrorToResponse,
  noContentResponse,
  successResponse,
} from './response-mapper.js';

export interface CatalogueUseCases {
  readonly createProduct: Pick<CreateProduct, 'execute'>;
  readonly getProduct: Pick<GetProduct, 'execute'>;
  readonly listProducts: Pick<ListProducts, 'execute'>;
  readonly updateProduct: Pick<UpdateProduct, 'execute'>;
  readonly deleteProduct: Pick<DeleteProduct, 'execute'>;
}

export type CatalogueHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>;

const PRODUCTS_PATH = '/api/v1/products';
const PRODUCT_PATH_PATTERN = /^\/api\/v1\/products\/[^/]+$/;

export const createCatalogueHandler = (useCases: CatalogueUseCases): CatalogueHandler =>
  async function catalogueHandler(event) {
    const requestId = event.requestContext.requestId || 'unavailable';
    const method = event.requestContext.http.method.toUpperCase();

    try {
      if (method === 'GET' && event.rawPath === PRODUCTS_PATH) {
        const products: readonly Product[] = await useCases.listProducts.execute();
        return successResponse(200, products, requestId);
      }

      if (method === 'POST' && event.rawPath === PRODUCTS_PATH) {
        const request: CreateProductRequest = parseCreateProductRequest(event);
        const product = await useCases.createProduct.execute(request);
        return successResponse(201, product, requestId);
      }

      if (PRODUCT_PATH_PATTERN.test(event.rawPath)) {
        const productId = parseProductId(event);

        if (method === 'GET') {
          const product = await useCases.getProduct.execute(productId);
          return successResponse(200, product, requestId);
        }

        if (method === 'PATCH') {
          const request: UpdateProductRequest = parseUpdateProductRequest(event);
          const product = await useCases.updateProduct.execute(productId, request);
          return successResponse(200, product, requestId);
        }

        if (method === 'DELETE') {
          await useCases.deleteProduct.execute(productId);
          return noContentResponse();
        }
      }

      return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found.', requestId);
    } catch (error) {
      return mapErrorToResponse(error, requestId);
    }
  };
