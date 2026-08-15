import type { Order } from '@smartretailx/api-contracts';

/**
 * Storage-agnostic order persistence boundary.
 * Implementations retain and return deep value copies to isolate mutable callers.
 */
export interface OrderRepository {
  create(order: Order): Promise<boolean>;
  findById(orderId: string): Promise<Order | null>;
  listAll(): Promise<readonly Order[]>;
  listByCustomerId(customerId: string): Promise<readonly Order[]>;
}
