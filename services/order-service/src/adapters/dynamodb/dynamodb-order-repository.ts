import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type {
  DynamoDBDocumentClient,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommandInput,
  ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { orderSchema } from '@smartretailx/api-contracts';
import type { Order } from '@smartretailx/api-contracts';
import type { OrderRepository } from '../../application/ports/order-repository.js';
import { copyOrder } from '../../domain/order.js';

const isConditionalFailure = (error: unknown): error is ConditionalCheckFailedException =>
  error instanceof ConditionalCheckFailedException;

export const CUSTOMER_ORDERS_INDEX_NAME = 'customerId-createdAt-index';

export class DynamoDBOrderRepository implements OrderRepository {
  public constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {
    if (tableName.trim().length === 0) {
      throw new Error('A non-empty DynamoDB orders table name is required.');
    }
  }

  public async create(order: Order): Promise<boolean> {
    try {
      await this.documentClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: copyOrder(order),
          ConditionExpression: 'attribute_not_exists(orderId)',
        }),
      );
      return true;
    } catch (error) {
      if (isConditionalFailure(error)) {
        return false;
      }

      throw error;
    }
  }

  public async findById(orderId: string): Promise<Order | null> {
    const output = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { orderId },
      }),
    );

    if (output.Item === undefined) {
      return null;
    }

    return copyOrder(orderSchema.parse(output.Item));
  }

  public async listAll(): Promise<readonly Order[]> {
    const orders: Order[] = [];
    let exclusiveStartKey: ScanCommandOutput['LastEvaluatedKey'];

    do {
      const input: ScanCommandInput = {
        TableName: this.tableName,
        ...(exclusiveStartKey === undefined ? {} : { ExclusiveStartKey: exclusiveStartKey }),
      };
      const output = await this.documentClient.send(new ScanCommand(input));

      for (const item of output.Items ?? []) {
        orders.push(copyOrder(orderSchema.parse(item)));
      }

      exclusiveStartKey = output.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined && Object.keys(exclusiveStartKey).length > 0);

    return orders;
  }

  public async listByCustomerId(customerId: string): Promise<readonly Order[]> {
    const orders: Order[] = [];
    let exclusiveStartKey: QueryCommandOutput['LastEvaluatedKey'];

    do {
      const input: QueryCommandInput = {
        TableName: this.tableName,
        IndexName: CUSTOMER_ORDERS_INDEX_NAME,
        KeyConditionExpression: '#customerId = :customerId',
        ExpressionAttributeNames: { '#customerId': 'customerId' },
        ExpressionAttributeValues: { ':customerId': customerId },
        ...(exclusiveStartKey === undefined ? {} : { ExclusiveStartKey: exclusiveStartKey }),
      };
      const output = await this.documentClient.send(new QueryCommand(input));

      for (const item of output.Items ?? []) {
        orders.push(copyOrder(orderSchema.parse(item)));
      }

      exclusiveStartKey = output.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined && Object.keys(exclusiveStartKey).length > 0);

    return orders;
  }
}
