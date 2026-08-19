import { readConfiguration, readOrderWorkflowConfiguration } from '../../src/index.js';

describe('readOrderWorkflowConfiguration', () => {
  test('reads ORDERS_TABLE_NAME', () => {
    expect(readOrderWorkflowConfiguration({ ORDERS_TABLE_NAME: 'OrdersTable' })).toEqual({
      ordersTableName: 'OrdersTable',
    });
  });

  test('rejects a missing ORDERS_TABLE_NAME', () => {
    expect(() => readOrderWorkflowConfiguration({})).toThrow('ORDERS_TABLE_NAME');
  });

  test('rejects a blank ORDERS_TABLE_NAME', () => {
    expect(() => readOrderWorkflowConfiguration({ ORDERS_TABLE_NAME: '   ' })).toThrow(
      'ORDERS_TABLE_NAME',
    );
  });

  test('does not require workflow configuration through unrelated HTTP configuration', () => {
    expect(
      readConfiguration({
        PORT: '3000',
        COGNITO_USER_POOL_ISSUER: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_example',
        COGNITO_USER_POOL_CLIENT_ID: 'public-client-id',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 3000,
      cognitoUserPoolId: 'ap-south-1_example',
      cognitoUserPoolClientId: 'public-client-id',
    });
  });
});
