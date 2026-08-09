import type { ApiErrorResponse, ApiSuccessResponse, Order } from '@smartretailx/api-contracts';
import { jest } from '@jest/globals';
import request from 'supertest';
import { InMemoryOrderRepository, createApp } from '../../src/index.js';
import type { OrderRepository } from '../../src/index.js';
import {
  FixedClock,
  FixedIdGenerator,
  ORDER_ID,
  SECOND_ORDER_ID,
  createOrderRequest,
  orderFixture,
} from '../support/fixtures.js';

const createTestApp = (repository: OrderRepository = new InMemoryOrderRepository()) =>
  createApp({
    repository,
    idGenerator: new FixedIdGenerator(),
    clock: new FixedClock(),
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
      .set('x-request-id', 'create-request')
      .send(createOrderRequest());
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
      .set('Content-Type', 'application/json')
      .send('{"customerId":');
    const body = response.body as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });

  test('POST /api/v1/orders rejects an invalid body with 400', async () => {
    const response = await request(createTestApp()).post('/api/v1/orders').send({
      customerId: 'not-a-uuid',
      items: [],
      currency: 'usd',
    });
    const body = response.body as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/v1/orders rejects client-supplied protected fields', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/orders')
      .send({
        ...createOrderRequest(),
        orderId: ORDER_ID,
        totalAmount: 0,
        status: 'CONFIRMED',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/v1/orders returns an empty list', async () => {
    const response = await request(createTestApp()).get('/api/v1/orders');
    const body = response.body as ApiSuccessResponse<readonly Order[]>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  test('GET /api/v1/orders returns a populated list', async () => {
    const repository = new InMemoryOrderRepository([
      orderFixture(),
      orderFixture({ orderId: SECOND_ORDER_ID }),
    ]);
    const response = await request(createTestApp(repository)).get('/api/v1/orders');
    const body = response.body as ApiSuccessResponse<readonly Order[]>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual([orderFixture(), orderFixture({ orderId: SECOND_ORDER_ID })]);
  });

  test('GET /api/v1/orders/:orderId returns an existing order', async () => {
    const repository = new InMemoryOrderRepository([orderFixture()]);
    const response = await request(createTestApp(repository)).get(`/api/v1/orders/${ORDER_ID}`);

    expect(response.status).toBe(200);
    expect((response.body as ApiSuccessResponse<Order>).data).toEqual(orderFixture());
  });

  test('GET /api/v1/orders/:orderId returns 404 for a missing order', async () => {
    const response = await request(createTestApp()).get(`/api/v1/orders/${ORDER_ID}`);

    expect(response.status).toBe(404);
    expect((response.body as ApiErrorResponse).error).toEqual({
      code: 'ORDER_NOT_FOUND',
      message: 'The order was not found.',
    });
  });

  test('GET /api/v1/orders/:orderId returns 400 for an invalid UUID', async () => {
    const response = await request(createTestApp()).get('/api/v1/orders/not-a-uuid');

    expect(response.status).toBe(400);
    expect((response.body as ApiErrorResponse).error.code).toBe('VALIDATION_ERROR');
  });

  test('unexpected failures return a generic 500 without a stack trace', async () => {
    const repository = new InMemoryOrderRepository();
    jest.spyOn(repository, 'list').mockRejectedValue(new Error('sensitive storage detail'));

    const response = await request(createTestApp(repository)).get('/api/v1/orders');
    const body = response.body as ApiErrorResponse;

    expect(response.status).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(response.text).not.toContain('sensitive storage detail');
    expect(response.text).not.toContain('Error:');
  });
});
