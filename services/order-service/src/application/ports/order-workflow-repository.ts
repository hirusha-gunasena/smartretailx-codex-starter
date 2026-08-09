import type { OrderStatus } from '@smartretailx/api-contracts';

export type OrderWorkflowTargetStatus = Exclude<OrderStatus, 'PENDING'>;

export const ORDER_WORKFLOW_TRANSITION_RESULT = {
  UPDATED: 'UPDATED',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
} as const;

export type OrderWorkflowTransitionResult =
  (typeof ORDER_WORKFLOW_TRANSITION_RESULT)[keyof typeof ORDER_WORKFLOW_TRANSITION_RESULT];

export interface OrderWorkflowTransition {
  readonly orderId: string;
  readonly targetStatus: OrderWorkflowTargetStatus;
  readonly updatedAt: string;
}

export interface OrderWorkflowRepository {
  transitionFromPending(
    transition: OrderWorkflowTransition,
  ): Promise<OrderWorkflowTransitionResult>;
}
