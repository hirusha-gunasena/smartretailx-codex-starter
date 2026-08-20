import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Handler,
} from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;

export const handler: Handler<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2> = async (
  event,
) => {
  try {
    const method = event.requestContext.http.method.toUpperCase();

    if (method === 'GET') {
      const command = new ListUsersCommand({ UserPoolId: USER_POOL_ID });
      const response = await client.send(command);

      const users = (response.Users || []).map((user) => {
        const attributes =
          user.Attributes?.reduce(
            (acc, attr) => {
              if (attr.Name) acc[attr.Name] = attr.Value || '';
              return acc;
            },
            {} as Record<string, string>,
          ) || {};

        return {
          id: user.Username,
          email: attributes.email,
          status: user.UserStatus,
          enabled: user.Enabled,
          created: user.UserCreateDate,
        };
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users),
      };
    }

    if (method === 'PATCH' && event.pathParameters?.username) {
      const username = event.pathParameters.username;
      const body = JSON.parse(event.body || '{}');
      // e.g. disabling user or updating attributes can be implemented here later
      return {
        statusCode: 200,
        body: JSON.stringify({ message: `User ${username} updated` }),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    console.error('Admin API Error:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal Server Error' }) };
  }
};
