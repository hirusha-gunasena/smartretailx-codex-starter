import { readConfiguration, readProductionConfiguration } from '../../src/index.js';

const authenticationEnvironment = {
  COGNITO_USER_POOL_ISSUER: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_example',
  COGNITO_USER_POOL_CLIENT_ID: ' public-client-id ',
};

const authenticationConfiguration = {
  cognitoUserPoolId: 'ap-south-1_example',
  cognitoUserPoolClientId: 'public-client-id',
};

describe('readConfiguration', () => {
  test('defaults to port 3000 and all network interfaces', () => {
    expect(readConfiguration(authenticationEnvironment)).toEqual({
      host: '0.0.0.0',
      port: 3000,
      ...authenticationConfiguration,
    });
  });

  test('reads a configured port', () => {
    expect(readConfiguration({ ...authenticationEnvironment, PORT: ' 8080 ' })).toEqual({
      host: '0.0.0.0',
      port: 8080,
      ...authenticationConfiguration,
    });
  });

  test.each(['', '0', '65536', '3000.5', 'not-a-port'])('rejects invalid PORT %p', (port) => {
    expect(() => readConfiguration({ ...authenticationEnvironment, PORT: port })).toThrow();
  });

  test('requires both non-secret Cognito verifier settings', () => {
    expect(() =>
      readConfiguration({
        COGNITO_USER_POOL_ISSUER: authenticationEnvironment.COGNITO_USER_POOL_ISSUER,
      }),
    ).toThrow(/COGNITO_USER_POOL_CLIENT_ID/u);
    expect(() =>
      readConfiguration({
        COGNITO_USER_POOL_CLIENT_ID: authenticationEnvironment.COGNITO_USER_POOL_CLIENT_ID,
      }),
    ).toThrow(/COGNITO_USER_POOL_ISSUER/u);
  });

  test('rejects a non-Cognito or non-canonical issuer', () => {
    expect(() =>
      readConfiguration({
        ...authenticationEnvironment,
        COGNITO_USER_POOL_ISSUER: 'https://example.com/ap-south-1_example',
      }),
    ).toThrow(/COGNITO_USER_POOL_ISSUER/u);
  });
});

describe('readProductionConfiguration', () => {
  test('accepts and trims a valid ORDERS_TABLE_NAME', () => {
    expect(
      readProductionConfiguration({
        ...authenticationEnvironment,
        ORDERS_TABLE_NAME: ' OrdersTable ',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 3000,
      ordersTableName: 'OrdersTable',
      ...authenticationConfiguration,
    });
  });

  test('fails clearly when ORDERS_TABLE_NAME is missing', () => {
    expect(() => readProductionConfiguration(authenticationEnvironment)).toThrow(
      /ORDERS_TABLE_NAME/u,
    );
  });

  test('rejects an empty ORDERS_TABLE_NAME', () => {
    expect(() =>
      readProductionConfiguration({ ...authenticationEnvironment, ORDERS_TABLE_NAME: '   ' }),
    ).toThrow(/ORDERS_TABLE_NAME/u);
  });
});
