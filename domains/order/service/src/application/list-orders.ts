import type { Order } from '@smartretailx/api-contracts';
import { customerIdForCognitoSubject } from '../domain/customer-identity.js';
import { OrderAuthorizationError } from '../domain/authorization-errors.js';
import { OrderEntity } from '../domain/order.js';
import type { VerifiedOrderCaller } from './ports/order-caller-authenticator.js';
import type { OrderRepository } from './ports/order-repository.js';

export class ListOrders {
  public constructor(private readonly repository: OrderRepository) {}

  public async execute(caller: VerifiedOrderCaller): Promise<readonly Order[]> {
    let orders: readonly Order[];
    if (caller.role === 'admin') {
      orders = await this.repository.listAll();
    } else if (caller.role === 'customer') {
      orders = await this.repository.listByCustomerId(customerIdForCognitoSubject(caller.subject));
    } else {
      throw new OrderAuthorizationError('AUTH_INSUFFICIENT_ROLE');
    }
    return orders.map((order) => OrderEntity.rehydrate(order).snapshot());
  }
}
