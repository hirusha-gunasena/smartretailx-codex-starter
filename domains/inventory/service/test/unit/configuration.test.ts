import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';
import { createDynamoDBDocumentClient, readInventoryConfiguration } from '../../src/index.js';

describe('readInventoryConfiguration', () => {
  test('accepts and trims both required table names', () => {
    expect(
      readInventoryConfiguration({
        INVENTORY_TABLE_NAME: ' InventoryTable ',
        INVENTORY_RESERVATIONS_TABLE_NAME: ' InventoryReservationsTable ',
      }),
    ).toEqual({
      inventoryTableName: 'InventoryTable',
      reservationsTableName: 'InventoryReservationsTable',
    });
  });

  test('rejects a missing inventory table name', () => {
    expect(() =>
      readInventoryConfiguration({
        INVENTORY_RESERVATIONS_TABLE_NAME: 'InventoryReservationsTable',
      }),
    ).toThrow(/INVENTORY_TABLE_NAME/u);
  });

  test('rejects a missing reservations table name', () => {
    expect(() =>
      readInventoryConfiguration({
        INVENTORY_TABLE_NAME: 'InventoryTable',
      }),
    ).toThrow(/INVENTORY_RESERVATIONS_TABLE_NAME/u);
  });

  test('rejects empty table names', () => {
    expect(() =>
      readInventoryConfiguration({
        INVENTORY_TABLE_NAME: '   ',
        INVENTORY_RESERVATIONS_TABLE_NAME: '   ',
      }),
    ).toThrow();
  });
});

describe('createDynamoDBDocumentClient', () => {
  test('reuses the SDK document abstraction with undefined-value removal enabled', () => {
    const documentClient = {} as DynamoDBDocumentClient;
    const from = jest.spyOn(DynamoDBDocumentClient, 'from').mockReturnValue(documentClient);

    expect(createDynamoDBDocumentClient()).toBe(documentClient);
    expect(from).toHaveBeenCalledWith(expect.any(DynamoDBClient), {
      marshallOptions: { removeUndefinedValues: true },
    });

    from.mockRestore();
  });
});
