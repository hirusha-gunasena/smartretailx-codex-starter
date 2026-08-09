import type { Order } from '@smartretailx/api-contracts';
import { OrderEntity } from '../domain/order.js';
import type { OrderRepository } from './ports/order-repository.js';

export class ListOrders {
  public constructor(private readonly repository: OrderRepository) {}

  public async execute(): Promise<readonly Order[]> {
    const orders = await this.repository.list();
    return orders.map((order) => OrderEntity.rehydrate(order).snapshot());
  }
}
