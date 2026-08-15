import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { OrderAuthorizationTelemetry } from '../../application/ports/order-authorization-telemetry.js';
import type {
  OrderCallerAuthenticator,
  OrderRole,
  VerifiedOrderCaller,
} from '../../application/ports/order-caller-authenticator.js';
import {
  OrderAuthenticationError,
  OrderAuthorizationError,
} from '../../domain/authorization-errors.js';

export interface OrderAuthorizationRoute {
  readonly method: 'GET' | 'POST';
  readonly route: '/api/v1/orders' | '/api/v1/orders/:orderId';
  readonly roles: readonly OrderRole[];
}

const denialTelemetry = (
  request: Request,
  route: OrderAuthorizationRoute,
  reasonCode: OrderAuthenticationError['reasonCode'] | OrderAuthorizationError['reasonCode'],
): Parameters<OrderAuthorizationTelemetry['record']>[0] => ({
  event: 'order.authorization',
  method: request.method,
  route: route.route,
  decision: 'DENY',
  reasonCode,
  tokenUse: reasonCode === 'AUTH_INVALID_GROUPS' ? 'access' : 'unknown',
  subjectPresent: reasonCode === 'AUTH_INVALID_GROUPS',
  scopePresent: reasonCode === 'AUTH_INVALID_GROUPS',
});

export const createOrderAuthorization =
  (
    authenticator: OrderCallerAuthenticator,
    telemetry: OrderAuthorizationTelemetry,
    route: OrderAuthorizationRoute,
  ): RequestHandler =>
  async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const caller = await authenticator.authenticate(request.header('authorization'));
      if (!route.roles.includes(caller.role)) {
        telemetry.record({
          event: 'order.authorization',
          method: request.method,
          route: route.route,
          decision: 'DENY',
          reasonCode: 'AUTH_INSUFFICIENT_ROLE',
          tokenUse: 'access',
          subjectPresent: true,
          scopePresent: true,
          role: caller.role,
        });
        next(new OrderAuthorizationError('AUTH_INSUFFICIENT_ROLE'));
        return;
      }

      response.locals.orderCaller = caller;
      telemetry.record({
        event: 'order.authorization',
        method: request.method,
        route: route.route,
        decision: 'ALLOW',
        reasonCode: 'AUTH_ALLOWED',
        tokenUse: 'access',
        subjectPresent: true,
        scopePresent: true,
        role: caller.role,
      });
      next();
    } catch (error) {
      if (error instanceof OrderAuthenticationError || error instanceof OrderAuthorizationError) {
        telemetry.record(denialTelemetry(request, route, error.reasonCode));
      }
      next(error);
    }
  };

export const verifiedOrderCaller = (response: Response): VerifiedOrderCaller => {
  const caller = response.locals.orderCaller as VerifiedOrderCaller | undefined;
  if (caller === undefined) {
    throw new OrderAuthenticationError('AUTH_MISSING_TOKEN');
  }
  return caller;
};
