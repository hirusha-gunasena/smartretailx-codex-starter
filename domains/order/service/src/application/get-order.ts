import type { Order } from '@smartretailx/api-contracts';
import { customerIdForCognitoSubject } from '../domain/customer-identity.js';
import {
  OrderAuthorizationError,
  OrderOwnershipMismatchError,
} from '../domain/authorization-errors.js';
import { OrderNotFoundError } from '../domain/errors.js';
import { OrderEntity } from '../domain/order.js';
import type { VerifiedOrderCaller } from './ports/order-caller-authenticator.js';
import type { OrderRepository } from './ports/order-repository.js';

export class GetOrder {
  public constructor(private readonly repository: OrderRepository) {}

  public async execute(orderId: string, caller: VerifiedOrderCaller): Promise<Order> {
    if (caller.role !== 'customer' && caller.role !== 'admin') {
      throw new OrderAuthorizationError('AUTH_INSUFFICIENT_ROLE');
    }

    const order = await this.repository.findById(orderId);

    if (order === null) {
      throw new OrderNotFoundError(orderId);
    }

    if (
      caller.role === 'customer' &&
      order.customerId !== customerIdForCognitoSubject(caller.subject)
    ) {
      throw new OrderOwnershipMismatchError(orderId);
    }

    return OrderEntity.rehydrate(order).snapshot();
  }
}
