import { z } from 'zod';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const portSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, 'PORT must be an integer')
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

const authenticationEnvironmentSchema = z.object({
  COGNITO_USER_POOL_ISSUER: z
    .string({ error: 'COGNITO_USER_POOL_ISSUER is required' })
    .trim()
    .url()
    .min(1),
  COGNITO_USER_POOL_CLIENT_ID: z
    .string({ error: 'COGNITO_USER_POOL_CLIENT_ID is required' })
    .trim()
    .min(1, 'COGNITO_USER_POOL_CLIENT_ID must not be empty'),
});

const productionEnvironmentSchema = authenticationEnvironmentSchema.extend({
  ORDERS_TABLE_NAME: z
    .string({ error: 'ORDERS_TABLE_NAME is required for production persistence' })
    .trim()
    .min(1, 'ORDERS_TABLE_NAME must not be empty'),
});

export interface OrderServiceConfiguration {
  readonly host: '0.0.0.0';
  readonly port: number;
  readonly cognitoUserPoolId: string;
  readonly cognitoUserPoolClientId: string;
}

export interface ProductionOrderServiceConfiguration extends OrderServiceConfiguration {
  readonly ordersTableName: string;
}

const userPoolIdFromIssuer = (issuer: string): string => {
  const parsedIssuer = new URL(issuer);
  const pathParts = parsedIssuer.pathname.split('/').filter((part) => part.length > 0);
  if (
    parsedIssuer.protocol !== 'https:' ||
    parsedIssuer.username.length > 0 ||
    parsedIssuer.password.length > 0 ||
    parsedIssuer.search.length > 0 ||
    parsedIssuer.hash.length > 0 ||
    pathParts.length !== 1
  ) {
    throw new Error('COGNITO_USER_POOL_ISSUER must be a canonical Cognito User Pool issuer.');
  }

  const userPoolId = pathParts[0]!;
  const expectedIssuer = CognitoJwtVerifier.parseUserPoolId(userPoolId).issuer;
  if (issuer.replace(/\/$/u, '') !== expectedIssuer) {
    throw new Error('COGNITO_USER_POOL_ISSUER must match its Cognito User Pool ID.');
  }

  return userPoolId;
};

export const readConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): OrderServiceConfiguration => {
  const configuredPort = environment.PORT;
  const port = configuredPort === undefined ? 3_000 : portSchema.parse(configuredPort);
  const authenticationEnvironment = authenticationEnvironmentSchema.parse(environment);

  return {
    host: '0.0.0.0',
    port,
    cognitoUserPoolId: userPoolIdFromIssuer(authenticationEnvironment.COGNITO_USER_POOL_ISSUER),
    cognitoUserPoolClientId: authenticationEnvironment.COGNITO_USER_POOL_CLIENT_ID,
  };
};

export const readProductionConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): ProductionOrderServiceConfiguration => {
  const configuration = readConfiguration(environment);
  const productionEnvironment = productionEnvironmentSchema.parse(environment);

  return {
    ...configuration,
    ordersTableName: productionEnvironment.ORDERS_TABLE_NAME,
  };
};
