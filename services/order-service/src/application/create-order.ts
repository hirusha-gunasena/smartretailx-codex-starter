import type { CreateOrderRequest, Order } from '@smartretailx/api-contracts';
import { OrderConflictError } from '../domain/errors.js';
import { OrderEntity } from '../domain/order.js';
import type { Clock } from './ports/clock.js';
import type { IdGenerator } from './ports/id-generator.js';
import type { OrderRepository } from './ports/order-repository.js';

export class CreateOrder {
  public constructor(
    private readonly repository: OrderRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(request: CreateOrderRequest): Promise<Order> {
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
