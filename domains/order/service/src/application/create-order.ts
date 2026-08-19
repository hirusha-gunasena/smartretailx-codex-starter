import type { CreateOrderBody, CreateOrderRequest, Order } from '@smartretailx/api-contracts';
import { customerIdForCognitoSubject } from '../domain/customer-identity.js';
import { OrderAuthorizationError } from '../domain/authorization-errors.js';
import { OrderConflictError } from '../domain/errors.js';
import { OrderEntity } from '../domain/order.js';
import type { Clock } from './ports/clock.js';
import type { IdGenerator } from './ports/id-generator.js';
import type { VerifiedOrderCaller } from './ports/order-caller-authenticator.js';
import type { OrderRepository } from './ports/order-repository.js';

export class CreateOrder {
  public constructor(
    private readonly repository: OrderRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(body: CreateOrderBody, caller: VerifiedOrderCaller): Promise<Order> {
    if (caller.role !== 'customer') {
      throw new OrderAuthorizationError('AUTH_INSUFFICIENT_ROLE');
    }

    const request: CreateOrderRequest = {
      ...body,
      customerId: customerIdForCognitoSubject(caller.subject),
    };
    const order = OrderEntity.create(
      request,
      this.idGenerator.generate(),
      this.clock.now(),
    ).snapshot();

    if (!(await this.repository.create(order))) {
      throw new OrderConflictError(order.orderId);
    }

    return OrderEntity.rehydrate(order).snapshot();
  }
}
