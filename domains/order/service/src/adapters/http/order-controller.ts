import type { Order } from '@smartretailx/api-contracts';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { CreateOrder } from '../../application/create-order.js';
import type { GetOrder } from '../../application/get-order.js';
import type { ListOrders } from '../../application/list-orders.js';
import type { OrderAuthorizationTelemetry } from '../../application/ports/order-authorization-telemetry.js';
import type { OrderCallerAuthenticator } from '../../application/ports/order-caller-authenticator.js';
import { OrderOwnershipMismatchError } from '../../domain/authorization-errors.js';
import { createOrderAuthorization, verifiedOrderCaller } from './order-authorization.js';
import { parseCreateOrderRequest, parseOrderId } from './request-parser.js';
import { sendSuccess } from './response-mapper.js';

export interface OrderUseCases {
  readonly createOrder: Pick<CreateOrder, 'execute'>;
  readonly getOrder: Pick<GetOrder, 'execute'>;
  readonly listOrders: Pick<ListOrders, 'execute'>;
}

export interface OrderHttpSecurity {
  readonly authenticator: OrderCallerAuthenticator;
  readonly telemetry: OrderAuthorizationTelemetry;
}

const forwardError = (error: unknown, next: NextFunction): void => {
  next(error);
};

export const createOrderRouter = (useCases: OrderUseCases, security: OrderHttpSecurity): Router => {
  const router = Router();

  router.post(
    '/',
    createOrderAuthorization(security.authenticator, security.telemetry, {
      method: 'POST',
      route: '/api/v1/orders',
      roles: ['customer'],
    }),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const order = await useCases.createOrder.execute(
          parseCreateOrderRequest(request.body),
          verifiedOrderCaller(response),
        );
        sendSuccess(request, response, 201, order);
      } catch (error) {
        forwardError(error, next);
      }
    },
  );

  router.get(
    '/',
    createOrderAuthorization(security.authenticator, security.telemetry, {
      method: 'GET',
      route: '/api/v1/orders',
      roles: ['customer', 'admin'],
    }),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const orders: readonly Order[] = await useCases.listOrders.execute(
          verifiedOrderCaller(response),
        );
        sendSuccess(request, response, 200, orders);
      } catch (error) {
        forwardError(error, next);
      }
    },
  );

  router.get(
    '/:orderId',
    createOrderAuthorization(security.authenticator, security.telemetry, {
      method: 'GET',
      route: '/api/v1/orders/:orderId',
      roles: ['customer', 'admin'],
    }),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const orderIdParameter = request.params.orderId;
        const orderId = parseOrderId(typeof orderIdParameter === 'string' ? orderIdParameter : '');
        const order = await useCases.getOrder.execute(orderId, verifiedOrderCaller(response));
        sendSuccess(request, response, 200, order);
      } catch (error) {
        if (error instanceof OrderOwnershipMismatchError) {
          security.telemetry.record({
            event: 'order.authorization',
            method: request.method,
            route: '/api/v1/orders/:orderId',
            decision: 'DENY',
            reasonCode: 'AUTH_OWNERSHIP_MISMATCH',
            tokenUse: 'access',
            subjectPresent: true,
            scopePresent: true,
            role: 'customer',
          });
        }
        forwardError(error, next);
      }
    },
  );

  return router;
};
