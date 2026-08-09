import type { Order } from '@smartretailx/api-contracts';
import { OrderNotFoundError } from '../domain/errors.js';
import { OrderEntity } from '../domain/order.js';
import type { OrderRepository } from './ports/order-repository.js';

export class GetOrder {
  public constructor(private readonly repository: OrderRepository) {}

  public async execute(orderId: string): Promise<Order> {
    const order = await this.repository.findById(orderId);

    if (order === null) {
      throw new OrderNotFoundError(orderId);
    }

    return OrderEntity.rehydrate(order).snapshot();
  }
}
