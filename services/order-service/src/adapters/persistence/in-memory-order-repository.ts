import type { Order } from '@smartretailx/api-contracts';
import type { OrderRepository } from '../../application/ports/order-repository.js';
import { copyOrder } from '../../domain/order.js';

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  public constructor(orders: readonly Order[] = []) {
    for (const order of orders) {
      this.orders.set(order.orderId, copyOrder(order));
    }
  }

  public async create(order: Order): Promise<boolean> {
    if (this.orders.has(order.orderId)) {
      return false;
    }

    this.orders.set(order.orderId, copyOrder(order));
    return true;
  }

  public async findById(orderId: string): Promise<Order | null> {
    const order = this.orders.get(orderId);
    return order === undefined ? null : copyOrder(order);
  }

  public async list(): Promise<readonly Order[]> {
    return [...this.orders.values()].map(copyOrder);
  }
}
