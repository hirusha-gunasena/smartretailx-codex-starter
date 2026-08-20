import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Handler,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

const INVENTORY_TABLE = process.env.INVENTORY_TABLE_NAME!;

export const handler: Handler<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2> = async (
  event,
) => {
  try {
    const method = event.requestContext.http.method.toUpperCase();
    const productId = event.pathParameters?.productId;

    if (!productId) {
      return { statusCode: 400, body: JSON.stringify({ message: 'productId is required' }) };
    }

    if (method === 'GET') {
      const result = await documentClient.send(
        new GetCommand({
          TableName: INVENTORY_TABLE,
          Key: { productId },
        }),
      );
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          availableQuantity: result.Item?.availableQuantity || 0,
        }),
      };
    }

    if (method === 'PATCH' || method === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const quantity =
        typeof body.quantity === 'number' ? body.quantity : parseInt(body.quantity, 10);

      if (isNaN(quantity)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'quantity must be a valid number' }),
        };
      }

      await documentClient.send(
        new PutCommand({
          TableName: INVENTORY_TABLE,
          Item: {
            productId,
            availableQuantity: quantity,
            updatedAt: new Date().toISOString(),
          },
        }),
      );

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, availableQuantity: quantity }),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    console.error('Inventory API Error:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal Server Error' }) };
  }
};
