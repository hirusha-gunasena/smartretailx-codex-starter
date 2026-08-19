import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';
import { createDynamoDBDocumentClient } from '../../src/index.js';

describe('createDynamoDBDocumentClient', () => {
  test('enables removal of undefined values during marshalling', () => {
    const documentClient = {} as DynamoDBDocumentClient;
    const from = jest.spyOn(DynamoDBDocumentClient, 'from').mockReturnValue(documentClient);

    expect(createDynamoDBDocumentClient()).toBe(documentClient);
    expect(from).toHaveBeenCalledWith(expect.any(DynamoDBClient), {
      marshallOptions: { removeUndefinedValues: true },
    });

    from.mockRestore();
  });
});
