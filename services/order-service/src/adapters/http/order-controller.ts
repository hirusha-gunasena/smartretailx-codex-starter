import type { Order } from '@smartretailx/api-contracts';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { CreateOrder } from '../../application/create-order.js';
import type { GetOrder } from '../../application/get-order.js';
import type { ListOrders } from '../../application/list-orders.js';
import { parseCreateOrderRequest, parseOrderId } from './request-parser.js';
import { sendSuccess } from './response-mapper.js';

export interface OrderUseCases {
  readonly createOrder: Pick<CreateOrder, 'execute'>;
  readonly getOrder: Pick<GetOrder, 'execute'>;
  readonly listOrders: Pick<ListOrders, 'execute'>;
}

const forwardError = (error: unknown, next: NextFunction): void => {
  next(error);
};

export const createOrderRouter = (useCases: OrderUseCases): Router => {
  const router = Router();

  router.post('/', async (request: Request, response: Response, next: NextFunction) => {
    try {
      const order = await useCases.createOrder.execute(parseCreateOrderRequest(request.body));
      sendSuccess(request, response, 201, order);
    } catch (error) {
      forwardError(error, next);
    }
  });

  router.get('/', async (request: Request, response: Response, next: NextFunction) => {
    try {
      const orders: readonly Order[] = await useCases.listOrders.execute();
      sendSuccess(request, response, 200, orders);
    } catch (error) {
      forwardError(error, next);
    }
  });

  router.get('/:orderId', async (request: Request, response: Response, next: NextFunction) => {
    try {
      const orderIdParameter = request.params.orderId;
      const orderId = parseOrderId(typeof orderIdParameter === 'string' ? orderIdParameter : '');
      const order = await useCases.getOrder.execute(orderId);
      sendSuccess(request, response, 200, order);
    } catch (error) {
      forwardError(error, next);
    }
  });

  return router;
};
