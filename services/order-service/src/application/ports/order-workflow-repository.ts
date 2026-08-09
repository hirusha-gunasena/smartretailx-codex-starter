import type { OrderStatus } from '@smartretailx/api-contracts';

export type OrderWorkflowTargetStatus = Exclude<OrderStatus, 'PENDING'>;

export const ORDER_WORKFLOW_TRANSITION_RESULT = {
  UPDATED: 'UPDATED',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
} as const;

export type OrderWorkflowTransitionResult =
  (typeof ORDER_WORKFLOW_TRANSITION_RESULT)[keyof typeof ORDER_WORKFLOW_TRANSITION_RESULT];

interface OrderWorkflowTransitionBase {
  readonly orderId: string;
  readonly updatedAt: string;
}

export interface ConfirmedOrderWorkflowTransition extends OrderWorkflowTransitionBase {
  readonly targetStatus: 'CONFIRMED';
  readonly reservationId: string;
}

export interface RejectedOrderWorkflowTransition extends OrderWorkflowTransitionBase {
  readonly targetStatus: 'REJECTED';
  readonly rejectionReason: string;
}

export type OrderWorkflowTransition =
  ConfirmedOrderWorkflowTransition | RejectedOrderWorkflowTransition;

export interface OrderWorkflowRepository {
  transitionFromPending(
    transition: OrderWorkflowTransition,
  ): Promise<OrderWorkflowTransitionResult>;
}
