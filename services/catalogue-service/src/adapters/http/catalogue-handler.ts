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
  authorizeCatalogueRequest,
  CATALOGUE_ROLES,
  writeAuthorizationDecisionLog,
} from './authorization.js';
import type { AuthorizationDecisionLogger, JwtAuthorizerContext } from './authorization.js';
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

export type CatalogueApiEvent = Omit<APIGatewayProxyEventV2, 'requestContext'> & {
  readonly requestContext: APIGatewayProxyEventV2['requestContext'] & {
    readonly authorizer?: {
      readonly jwt?: JwtAuthorizerContext;
    };
  };
};

export type CatalogueHandler = (
  event: CatalogueApiEvent,
) => Promise<APIGatewayProxyStructuredResultV2>;

const PRODUCTS_PATH = '/api/v1/products';
const PRODUCT_PATH_PATTERN = /^\/api\/v1\/products\/[^/]+$/;
const WRITE_ROLES = new Set([CATALOGUE_ROLES.admin]);

export const createCatalogueHandler = (
  useCases: CatalogueUseCases,
  authorizationLogger: AuthorizationDecisionLogger = writeAuthorizationDecisionLog,
): CatalogueHandler =>
  async function catalogueHandler(event) {
    const requestId = event.requestContext.requestId || 'unavailable';
    const method = event.requestContext.http.method.toUpperCase();
    const jwtAuthorizer = event.requestContext.authorizer?.jwt;
    const authorizationMetadata = { requestId, routeKey: event.routeKey };

    try {
      if (method === 'GET' && event.rawPath === PRODUCTS_PATH) {
        const products: readonly Product[] = await useCases.listProducts.execute();
        return successResponse(200, products, requestId);
      }

      if (method === 'POST' && event.rawPath === PRODUCTS_PATH) {
        authorizeCatalogueRequest(
          jwtAuthorizer,
          WRITE_ROLES,
          authorizationMetadata,
          authorizationLogger,
        );
        const request: CreateProductRequest = parseCreateProductRequest(event);
        const product = await useCases.createProduct.execute(request);
        return successResponse(201, product, requestId);
      }

      if (PRODUCT_PATH_PATTERN.test(event.rawPath)) {
        if (method === 'GET') {
          const productId = parseProductId(event);
          const product = await useCases.getProduct.execute(productId);
          return successResponse(200, product, requestId);
        }

        if (method === 'PATCH') {
          authorizeCatalogueRequest(
            jwtAuthorizer,
            WRITE_ROLES,
            authorizationMetadata,
            authorizationLogger,
          );
          const productId = parseProductId(event);
          const request: UpdateProductRequest = parseUpdateProductRequest(event);
          const product = await useCases.updateProduct.execute(productId, request);
          return successResponse(200, product, requestId);
        }

        if (method === 'DELETE') {
          authorizeCatalogueRequest(
            jwtAuthorizer,
            WRITE_ROLES,
            authorizationMetadata,
            authorizationLogger,
          );
          const productId = parseProductId(event);
          await useCases.deleteProduct.execute(productId);
          return noContentResponse();
        }
      }

      return errorResponse(404, 'ROUTE_NOT_FOUND', 'Route not found.', requestId);
    } catch (error) {
      return mapErrorToResponse(error, requestId);
    }
  };
