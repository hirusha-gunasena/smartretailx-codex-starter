import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';
import { createDynamoDbDocumentClient } from '../src/index.js';

describe('createDynamoDbDocumentClient', () => {
  test('enables removal of undefined values during marshalling', () => {
    const documentClient = {} as DynamoDBDocumentClient;
    const from = jest.spyOn(DynamoDBDocumentClient, 'from').mockReturnValue(documentClient);

    expect(createDynamoDbDocumentClient()).toBe(documentClient);
    expect(from).toHaveBeenCalledWith(expect.any(DynamoDBClient), {
      marshallOptions: { removeUndefinedValues: true },
    });

    from.mockRestore();
  });
});
