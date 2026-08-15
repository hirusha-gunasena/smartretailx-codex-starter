import express from 'express';
import type { Express } from 'express';
import { createOrderRouter } from '../adapters/http/order-controller.js';
import { errorBoundary, routeNotFound } from '../adapters/http/response-mapper.js';
import type { Clock } from '../application/ports/clock.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { OrderRepository } from '../application/ports/order-repository.js';
import type { OrderAuthorizationTelemetry } from '../application/ports/order-authorization-telemetry.js';
import type { OrderCallerAuthenticator } from '../application/ports/order-caller-authenticator.js';
import { CreateOrder } from '../application/create-order.js';
import { GetOrder } from '../application/get-order.js';
import { ListOrders } from '../application/list-orders.js';

export interface OrderAppDependencies {
  readonly repository: OrderRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly callerAuthenticator: OrderCallerAuthenticator;
  readonly authorizationTelemetry: OrderAuthorizationTelemetry;
}

export const createApp = (dependencies: OrderAppDependencies): Express => {
  const app = express();
  const useCases = {
    createOrder: new CreateOrder(
      dependencies.repository,
      dependencies.idGenerator,
      dependencies.clock,
    ),
    getOrder: new GetOrder(dependencies.repository),
    listOrders: new ListOrders(dependencies.repository),
  };

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb', strict: true }));
  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'healthy',
      service: 'order-service',
    });
  });
  app.use(
    '/api/v1/orders',
    createOrderRouter(useCases, {
      authenticator: dependencies.callerAuthenticator,
      telemetry: dependencies.authorizationTelemetry,
    }),
  );
  app.use(routeNotFound);
  app.use(errorBoundary);

  return app;
};
