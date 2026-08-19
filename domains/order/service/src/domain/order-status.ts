import type { OrderStatus } from '@smartretailx/api-contracts';

export const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const satisfies Record<OrderStatus, OrderStatus>;
