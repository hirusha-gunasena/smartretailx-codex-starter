import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { orderSchema } from '@smartretailx/api-contracts';
import {
  ORDER_WORKFLOW_TRANSITION_RESULT,
  type OrderWorkflowRepository,
  type OrderWorkflowTransition,
  type OrderWorkflowTransitionResult,
} from '../../application/ports/order-workflow-repository.js';
import {
  OrderNotFoundError,
  OrderWorkflowConflictError,
  OrderWorkflowValidationError,
} from '../../domain/errors.js';

const isConditionalFailure = (error: unknown): error is ConditionalCheckFailedException =>
  error instanceof ConditionalCheckFailedException;

export class DynamoDBOrderWorkflowRepository implements OrderWorkflowRepository {
  public constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {
    if (tableName.trim().length === 0) {
      throw new Error('A non-empty DynamoDB orders table name is required.');
    }
  }

  public async transitionFromPending(
    transition: OrderWorkflowTransition,
  ): Promise<OrderWorkflowTransitionResult> {
    try {
      await this.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { orderId: transition.orderId },
          UpdateExpression: 'SET #status = :targetStatus, #updatedAt = :updatedAt',
          ConditionExpression:
            'attribute_exists(#orderId) AND #status = :pendingStatus AND #createdAt <= :updatedAt',
          ExpressionAttributeNames: {
            '#orderId': 'orderId',
            '#status': 'status',
            '#createdAt': 'createdAt',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':pendingStatus': 'PENDING',
            ':targetStatus': transition.targetStatus,
            ':updatedAt': transition.updatedAt,
          },
        }),
      );

      return ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED;
    } catch (error) {
      if (!isConditionalFailure(error)) {
        throw error;
      }
    }

    const output = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { orderId: transition.orderId },
        ConsistentRead: true,
      }),
    );

    if (output.Item === undefined) {
      throw new OrderNotFoundError(transition.orderId);
    }

    const order = orderSchema.parse(output.Item);

    if (order.status === transition.targetStatus) {
      return ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED;
    }

    if (order.status !== 'PENDING') {
      throw new OrderWorkflowConflictError(
        transition.orderId,
        order.status,
        transition.targetStatus,
      );
    }

    if (Date.parse(transition.updatedAt) < Date.parse(order.createdAt)) {
      throw new OrderWorkflowValidationError(
        transition.orderId,
        'The inventory outcome occurred before the order was created.',
      );
    }

    throw new OrderWorkflowValidationError(
      transition.orderId,
      'The pending order did not satisfy the atomic workflow transition condition.',
    );
  }
}
