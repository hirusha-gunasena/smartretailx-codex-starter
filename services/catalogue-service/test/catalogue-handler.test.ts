import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  CreateProductRequest,
  Product,
} from '@smartretailx/api-contracts';
import { jest } from '@jest/globals';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { composeCatalogueHandler } from '../src/index.js';
import type { CatalogueHandler } from '../src/index.js';
import {
  AdjustableClock,
  FixedIdGenerator,
  PRODUCT_ID,
  UPDATED_AT,
  createProductRequest,
  productFixture,
} from './support/fixtures.js';
import { InMemoryProductRepository } from './support/in-memory-product-repository.js';

const REQUEST_ID = 'api-request-123';

const createEvent = (
  method: string,
  rawPath: string,
  options: {
    readonly body?: string;
    readonly productId?: string;
    readonly requestId?: string;
  } = {},
): APIGatewayProxyEventV2 => ({
  version: '2.0',
  routeKey: `${method} ${rawPath}`,
  rawPath,
  rawQueryString: '',
  headers: {},
  requestContext: {
    accountId: 'test-account',
    apiId: 'test-api',
    domainName: 'test.example.com',
    domainPrefix: 'test',
    http: {
      method,
      path: rawPath,
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'jest',
    },
    requestId: options.requestId ?? REQUEST_ID,
    routeKey: `${method} ${rawPath}`,
    stage: '$default',
    time: '08/Aug/2026:10:30:00 +0000',
    timeEpoch: 1_786_184_200_000,
  },
  isBase64Encoded: false,
  ...(options.body === undefined ? {} : { body: options.body }),
  ...(options.productId === undefined ? {} : { pathParameters: { productId: options.productId } }),
});

const createHandler = (
  repository: InMemoryProductRepository = new InMemoryProductRepository(),
): CatalogueHandler =>
  composeCatalogueHandler(repository, new FixedIdGenerator(), new AdjustableClock(UPDATED_AT));

const parseBody = <T>(response: APIGatewayProxyStructuredResultV2): T =>
  JSON.parse(response.body ?? 'null') as T;

describe('catalogue HTTP API handler', () => {
  test('GET /api/v1/products returns the product list', async () => {
    const handler = createHandler(new InMemoryProductRepository([productFixture()]));

    const response = await handler(createEvent('GET', '/api/v1/products'));

    expect(response.statusCode).toBe(200);
    expect(parseBody<ApiSuccessResponse<readonly Product[]>>(response).data).toEqual([
      productFixture(),
    ]);
  });

  test('GET /api/v1/products/{id} returns a product', async () => {
    const handler = createHandler(new InMemoryProductRepository([productFixture()]));

    const response = await handler(
      createEvent('GET', `/api/v1/products/${PRODUCT_ID}`, { productId: PRODUCT_ID }),
    );

    expect(response.statusCode).toBe(200);
    expect(parseBody<ApiSuccessResponse<Product>>(response).data).toEqual(productFixture());
  });

  test('POST /api/v1/products creates a product', async () => {
    const handler = createHandler();
    const request: CreateProductRequest = createProductRequest();

    const response = await handler(
      createEvent('POST', '/api/v1/products', { body: JSON.stringify(request) }),
    );

    expect(response.statusCode).toBe(201);
    expect(parseBody<ApiSuccessResponse<Product>>(response).data).toEqual(
      productFixture({ createdAt: UPDATED_AT, updatedAt: UPDATED_AT }),
    );
  });

  test('PATCH /api/v1/products/{id} partially updates a product', async () => {
    const handler = createHandler(new InMemoryProductRepository([productFixture()]));

    const response = await handler(
      createEvent('PATCH', `/api/v1/products/${PRODUCT_ID}`, {
        body: JSON.stringify({ price: 69.99 }),
        productId: PRODUCT_ID,
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(parseBody<ApiSuccessResponse<Product>>(response).data).toEqual(
      productFixture({ price: 69.99, updatedAt: UPDATED_AT }),
    );
  });

  test('DELETE /api/v1/products/{id} deletes a product', async () => {
    const handler = createHandler(new InMemoryProductRepository([productFixture()]));

    const response = await handler(
      createEvent('DELETE', `/api/v1/products/${PRODUCT_ID}`, { productId: PRODUCT_ID }),
    );

    expect(response.statusCode).toBe(204);
  });

  test('rejects malformed JSON with 400', async () => {
    const response = await createHandler()(createEvent('POST', '/api/v1/products', { body: '{' }));

    expect(response.statusCode).toBe(400);
    expect(parseBody<ApiErrorResponse>(response).error.code).toBe('INVALID_JSON');
  });

  test('rejects an invalid create payload with 400', async () => {
    const response = await createHandler()(
      createEvent('POST', '/api/v1/products', {
        body: JSON.stringify({ name: 'Keyboard', price: -1 }),
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(parseBody<ApiErrorResponse>(response).error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects an invalid update payload with 400', async () => {
    const handler = createHandler(new InMemoryProductRepository([productFixture()]));

    const response = await handler(
      createEvent('PATCH', `/api/v1/products/${PRODUCT_ID}`, {
        body: JSON.stringify({}),
        productId: PRODUCT_ID,
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(parseBody<ApiErrorResponse>(response).error.code).toBe('VALIDATION_ERROR');
  });

  test('maps a missing product to 404', async () => {
    const response = await createHandler()(
      createEvent('GET', `/api/v1/products/${PRODUCT_ID}`, { productId: PRODUCT_ID }),
    );

    expect(response.statusCode).toBe(404);
    expect(parseBody<ApiErrorResponse>(response).error.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('maps a product conflict to 409', async () => {
    const handler = createHandler(new InMemoryProductRepository([productFixture()]));

    const response = await handler(
      createEvent('POST', '/api/v1/products', {
        body: JSON.stringify(createProductRequest()),
      }),
    );

    expect(response.statusCode).toBe(409);
    expect(parseBody<ApiErrorResponse>(response).error.code).toBe('PRODUCT_CONFLICT');
  });

  test('returns 404 for an unsupported route', async () => {
    const response = await createHandler()(createEvent('PUT', '/api/v1/products'));

    expect(response.statusCode).toBe(404);
    expect(parseBody<ApiErrorResponse>(response).error.code).toBe('ROUTE_NOT_FOUND');
  });

  test('maps unexpected failures to a generic 500 without leaking details', async () => {
    const repository = new InMemoryProductRepository();
    jest.spyOn(repository, 'list').mockRejectedValue(new Error('sensitive DynamoDB detail'));

    const response = await createHandler(repository)(createEvent('GET', '/api/v1/products'));
    const body = parseBody<ApiErrorResponse>(response);

    expect(response.statusCode).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(response.body).not.toContain('sensitive DynamoDB detail');
  });

  test('propagates the API Gateway requestId in response bodies', async () => {
    const response = await createHandler()(
      createEvent('GET', '/api/v1/products', { requestId: 'propagated-request-id' }),
    );

    expect(parseBody<ApiSuccessResponse<readonly Product[]>>(response).requestId).toBe(
      'propagated-request-id',
    );
  });

  test('sets the JSON Content-Type header', async () => {
    const response = await createHandler()(createEvent('GET', '/api/v1/products'));

    expect(response.headers).toEqual(
      expect.objectContaining({ 'content-type': 'application/json' }),
    );
  });

  test('DELETE 204 has no response body', async () => {
    const handler = createHandler(new InMemoryProductRepository([productFixture()]));

    const response = await handler(
      createEvent('DELETE', `/api/v1/products/${PRODUCT_ID}`, { productId: PRODUCT_ID }),
    );

    expect(response).not.toHaveProperty('body');
  });

  test('rejects an invalid productId path parameter with 400', async () => {
    const response = await createHandler()(
      createEvent('GET', '/api/v1/products/not-a-uuid', { productId: 'not-a-uuid' }),
    );

    expect(response.statusCode).toBe(400);
    expect(parseBody<ApiErrorResponse>(response).error.code).toBe('VALIDATION_ERROR');
  });
});
