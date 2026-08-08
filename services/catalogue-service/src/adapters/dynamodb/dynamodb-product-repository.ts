import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  DynamoDBDocumentClient,
  ScanCommandInput,
  ScanCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { productSchema } from '@smartretailx/api-contracts';
import type { Product } from '@smartretailx/api-contracts';
import type { ProductRepository } from '../../application/ports/product-repository.js';

const copyProduct = (product: Product): Product => ({ ...product });

const isConditionalFailure = (error: unknown): error is ConditionalCheckFailedException =>
  error instanceof ConditionalCheckFailedException;

export class DynamoDbProductRepository implements ProductRepository {
  public constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {
    if (tableName.trim().length === 0) {
      throw new Error('A non-empty DynamoDB product table name is required.');
    }
  }

  public async create(product: Product): Promise<boolean> {
    try {
      await this.documentClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: copyProduct(product),
          ConditionExpression: 'attribute_not_exists(productId)',
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

  public async findById(productId: string): Promise<Product | null> {
    const output = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { productId },
      }),
    );

    if (output.Item === undefined) {
      return null;
    }

    return copyProduct(productSchema.parse(output.Item));
  }

  public async list(): Promise<readonly Product[]> {
    const products: Product[] = [];
    let exclusiveStartKey: ScanCommandOutput['LastEvaluatedKey'];

    do {
      const input: ScanCommandInput = {
        TableName: this.tableName,
        ...(exclusiveStartKey === undefined ? {} : { ExclusiveStartKey: exclusiveStartKey }),
      };
      const output = await this.documentClient.send(new ScanCommand(input));

      for (const item of output.Items ?? []) {
        products.push(copyProduct(productSchema.parse(item)));
      }

      exclusiveStartKey = output.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined && Object.keys(exclusiveStartKey).length > 0);

    return products;
  }

  public async update(product: Product): Promise<boolean> {
    const setExpressions = [
      '#name = :name',
      '#price = :price',
      '#currency = :currency',
      '#updatedAt = :updatedAt',
    ];
    const removeExpressions: string[] = [];
    const expressionAttributeValues: Record<string, unknown> = {
      ':name': product.name,
      ':price': product.price,
      ':currency': product.currency,
      ':updatedAt': product.updatedAt,
    };

    if (product.description === undefined) {
      removeExpressions.push('#description');
    } else {
      setExpressions.push('#description = :description');
      expressionAttributeValues[':description'] = product.description;
    }

    if (product.imageUrl === undefined) {
      removeExpressions.push('#imageUrl');
    } else {
      setExpressions.push('#imageUrl = :imageUrl');
      expressionAttributeValues[':imageUrl'] = product.imageUrl;
    }

    const updateExpression = `SET ${setExpressions.join(', ')}${
      removeExpressions.length === 0 ? '' : ` REMOVE ${removeExpressions.join(', ')}`
    }`;

    try {
      await this.documentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { productId: product.productId },
          ConditionExpression: 'attribute_exists(productId)',
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: {
            '#name': 'name',
            '#price': 'price',
            '#currency': 'currency',
            '#updatedAt': 'updatedAt',
            '#description': 'description',
            '#imageUrl': 'imageUrl',
          },
          ExpressionAttributeValues: expressionAttributeValues,
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

  public async delete(productId: string): Promise<boolean> {
    try {
      await this.documentClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { productId },
          ConditionExpression: 'attribute_exists(productId)',
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
}
