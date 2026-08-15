import type { ApiErrorResponse, ApiSuccessResponse, Order } from '@smartretailx/api-contracts';
import { jest } from '@jest/globals';
import request from 'supertest';
import { InMemoryOrderRepository, createApp } from '../../src/index.js';
import type { OrderRepository } from '../../src/index.js';
import {
  OTHER_CUSTOMER_ID,
  FixedClock,
  FixedIdGenerator,
  ORDER_ID,
  SECOND_ORDER_ID,
  createOrderBody,
  orderFixture,
} from '../support/fixtures.js';
import {
  ADMIN_AUTHORIZATION,
  CUSTOMER_AUTHORIZATION,
  OTHER_CUSTOMER_AUTHORIZATION,
  CapturingOrderAuthorizationTelemetry,
  TestOrderCallerAuthenticator,
} from '../support/authorization.js';

const createTestApp = (
  repository: OrderRepository = new InMemoryOrderRepository(),
  telemetry = new CapturingOrderAuthorizationTelemetry(),
) =>
  createApp({
    repository,
    idGenerator: new FixedIdGenerator(),
    clock: new FixedClock(),
    callerAuthenticator: new TestOrderCallerAuthenticator(),
    authorizationTelemetry: telemetry,
  });

describe('Order Service HTTP API', () => {
  test('GET /health returns the lightweight service health response', async () => {
    const response = await request(createTestApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'healthy',
      service: 'order-service',
    });
  });

  test('POST /api/v1/orders creates an order with 201', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/orders')
      .set('Authorization', CUSTOMER_AUTHORIZATION)
      .set('x-request-id', 'create-request')
      .send(createOrderBody());
    const body = response.body as ApiSuccessResponse<Order>;

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: orderFixture(),
      requestId: 'create-request',
    });
    expect(response.headers['x-request-id']).toBe('create-request');
  });

  test('POST /api/v1/orders rejects malformed JSON with 400', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/orders')
      .set('Authorization', CUSTOMER_AUTHORIZATION)
      .set('Content-Type', 'application/json')
      .send('{"items":');
    const body = response.body as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });

  test('POST /api/v1/orders rejects an invalid body with 400', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/orders')
      .set('Authorization', CUSTOMER_AUTHORIZATION)
      .send({ items: [], currency: 'usd' });
    const body = response.body as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/v1/orders rejects client-supplied protected fields', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/orders')
      .set('Authorization', CUSTOMER_AUTHORIZATION)
      .send({
        ...createOrderBody(),
        customerId: OTHER_CUSTOMER_ID,
        orderId: ORDER_ID,
        totalAmount: 0,
        status: 'CONFIRMED',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        reservationId: '550e8400-e29b-41d4-a716-446655440015',
        rejectionReason: 'INSUFFICIENT_STOCK',
      });

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('VALIDATION_ERROR');
  });

  test('POST rejects client-supplied customerId without calling persistence', async () => {
    const repository = new InMemoryOrderRepository();
    const create = jest.spyOn(repository, 'create');
    const response = await request(createTestApp(repository))
      .post('/api/v1/orders')
      .set('Authorization', CUSTOMER_AUTHORIZATION)
      .send({ ...createOrderBody(), customerId: OTHER_CUSTOMER_ID });

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('VALIDATION_ERROR');
    expect(create).not.toHaveBeenCalled();
  });

  test('GET /api/v1/orders returns an empty list', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/orders')
      .set('Authorization', CUSTOMER_AUTHORIZATION);
    const body = response.body as ApiSuccessResponse<readonly Order[]>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  test('GET /api/v1/orders returns a populated list', async () => {
    const repository = new InMemoryOrderRepository([
      orderFixture(),
      orderFixture({ orderId: SECOND_ORDER_ID }),
    ]);
    const response = await request(createTestApp(repository))
      .get('/api/v1/orders')
      .set('Authorization', ADMIN_AUTHORIZATION);
    const body = response.body as ApiSuccessResponse<readonly Order[]>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual([orderFixture(), orderFixture({ orderId: SECOND_ORDER_ID })]);
  });

  test('GET /api/v1/orders/:orderId returns an existing order', async () => {
    const repository = new InMemoryOrderRepository([orderFixture()]);
    const response = await request(createTestApp(repository))
      .get(`/api/v1/orders/${ORDER_ID}`)
      .set('Authorization', CUSTOMER_AUTHORIZATION);

    expect(response.status).toBe(200);
    expect((response.body as ApiSuccessResponse<Order>).data).toEqual(orderFixture());
  });

  test('GET /api/v1/orders/:orderId returns 404 for a missing order', async () => {
    const response = await request(createTestApp())
      .get(`/api/v1/orders/${ORDER_ID}`)
      .set('Authorization', CUSTOMER_AUTHORIZATION);

    expect(response.status).toBe(404);
    expect((response.body as ApiErrorResponse).error).toEqual({
      code: 'ORDER_NOT_FOUND',
      message: 'The order was not found.',
    });
  });

  test('GET /api/v1/orders/:orderId returns 400 for an invalid UUID', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/orders/not-a-uuid')
      .set('Authorization', CUSTOMER_AUTHORIZATION);

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('VALIDATION_ERROR');
  });

  test('unexpected failures return a generic 500 without a stack trace', async () => {
    const repository = new InMemoryOrderRepository();
    jest.spyOn(repository, 'listAll').mockRejectedValue(new Error('sensitive storage detail'));

    const response = await request(createTestApp(repository))
      .get('/api/v1/orders')
      .set('Authorization', ADMIN_AUTHORIZATION);
    const body = response.body as ApiErrorResponse;

    expect(response.status).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(response.text).not.toContain('sensitive storage detail');
    expect(response.text).not.toContain('Error:');
  });

  test('business routes reject a missing bearer token with 401', async () => {
    const response = await request(createTestApp()).get('/api/v1/orders');

    expect(response.status).toBe(401);
    expect((response.body as ApiErrorResponse).error.code).toBe('UNAUTHORIZED');
  });

  test('business routes reject an invalid bearer token with 401', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer invalid-test-token');

    expect(response.status).toBe(401);
    expect((response.body as ApiErrorResponse).error.code).toBe('UNAUTHORIZED');
  });

  test('business routes reject invalid or ambiguous group semantics with 403', async () => {
    const response = await request(createTestApp())
      .get('/api/v1/orders')
      .set('Authorization', 'Bearer invalid-groups-test-token');

    expect(response.status).toBe(403);
    expect((response.body as ApiErrorResponse).error.code).toBe('FORBIDDEN');
  });

  test('admin POST is denied before repository create', async () => {
    const repository = new InMemoryOrderRepository();
    const create = jest.spyOn(repository, 'create');

    const response = await request(createTestApp(repository))
      .post('/api/v1/orders')
      .set('Authorization', ADMIN_AUTHORIZATION)
      .send(createOrderBody());

    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  test('customer list excludes another customer order', async () => {
    const ownOrder = orderFixture();
    const otherOrder = orderFixture({
      orderId: SECOND_ORDER_ID,
      customerId: OTHER_CUSTOMER_ID,
    });
    const response = await request(
      createTestApp(new InMemoryOrderRepository([ownOrder, otherOrder])),
    )
      .get('/api/v1/orders')
      .set('Authorization', CUSTOMER_AUTHORIZATION);

    expect(response.status).toBe(200);
    expect((response.body as ApiSuccessResponse<readonly Order[]>).data).toEqual([ownOrder]);
  });

  test('customer receives indistinguishable 404 responses for absent and non-owned orders', async () => {
    const app = createTestApp(new InMemoryOrderRepository([orderFixture()]));
    const nonOwned = await request(app)
      .get(`/api/v1/orders/${ORDER_ID}`)
      .set('Authorization', OTHER_CUSTOMER_AUTHORIZATION);
    const absent = await request(app)
      .get(`/api/v1/orders/${SECOND_ORDER_ID}`)
      .set('Authorization', OTHER_CUSTOMER_AUTHORIZATION);

    expect(nonOwned.status).toBe(404);
    expect(absent.status).toBe(404);
    expect((nonOwned.body as ApiErrorResponse).error).toEqual(
      (absent.body as ApiErrorResponse).error,
    );
  });

  test('admin can read an existing customer order', async () => {
    const response = await request(createTestApp(new InMemoryOrderRepository([orderFixture()])))
      .get(`/api/v1/orders/${ORDER_ID}`)
      .set('Authorization', ADMIN_AUTHORIZATION);

    expect(response.status).toBe(200);
  });

  test('authorization telemetry records safe allow and ownership-deny evidence', async () => {
    const telemetry = new CapturingOrderAuthorizationTelemetry();
    await request(createTestApp(new InMemoryOrderRepository([orderFixture()]), telemetry))
      .get(`/api/v1/orders/${ORDER_ID}`)
      .set('Authorization', OTHER_CUSTOMER_AUTHORIZATION);

    expect(telemetry.entries).toEqual([
      expect.objectContaining({
        decision: 'ALLOW',
        reasonCode: 'AUTH_ALLOWED',
        role: 'customer',
        subjectPresent: true,
        method: 'GET',
        route: '/api/v1/orders/:orderId',
      }),
      expect.objectContaining({
        decision: 'DENY',
        reasonCode: 'AUTH_OWNERSHIP_MISMATCH',
        role: 'customer',
      }),
    ]);
    expect(JSON.stringify(telemetry.entries)).not.toMatch(
      /other-customer-test-token|opaque-customer|bearer|email|password|request body/iu,
    );
  });
});
