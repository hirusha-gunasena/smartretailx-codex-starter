import { createAwsCognitoOrderCallerAuthenticator } from './adapters/auth/cognito-order-caller-authenticator.js';
import { ConsoleOrderAuthorizationTelemetry } from './adapters/telemetry/console-order-authorization-telemetry.js';
import { createApp } from './composition/create-app.js';
import { readConfiguration } from './composition/configuration.js';
import { createInMemoryDependencies } from './composition/system-dependencies.js';

const configuration = readConfiguration();

export const app = createApp({
  ...createInMemoryDependencies(),
  callerAuthenticator: createAwsCognitoOrderCallerAuthenticator({
    userPoolId: configuration.cognitoUserPoolId,
    clientId: configuration.cognitoUserPoolClientId,
  }),
  authorizationTelemetry: new ConsoleOrderAuthorizationTelemetry(),
});
