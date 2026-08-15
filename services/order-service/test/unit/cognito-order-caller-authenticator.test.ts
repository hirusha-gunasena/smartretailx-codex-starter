import { jest } from '@jest/globals';
import {
  CognitoOrderCallerAuthenticator,
  OrderAuthenticationError,
  OrderAuthorizationError,
} from '../../src/index.js';

const accessClaims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  token_use: 'access',
  sub: 'opaque-cognito-subject',
  scope: 'openid email profile',
  'cognito:groups': ['customer'],
  email: 'must-not-enter-the-caller@example.test',
  ...overrides,
});

describe('CognitoOrderCallerAuthenticator', () => {
  let verify = jest.fn<(token: string) => Promise<unknown>>();
  let authenticator: CognitoOrderCallerAuthenticator;

  beforeEach(() => {
    verify = jest.fn<(token: string) => Promise<unknown>>();
    authenticator = new CognitoOrderCallerAuthenticator({ verify });
  });

  test('returns only the minimal customer caller after access-token verification', async () => {
    verify.mockResolvedValue(accessClaims());

    await expect(authenticator.authenticate('Bearer synthetic-test-token')).resolves.toEqual({
      subject: 'opaque-cognito-subject',
      role: 'customer',
    });
    expect(verify).toHaveBeenCalledWith('synthetic-test-token');
  });

  test('returns only the minimal admin caller', async () => {
    verify.mockResolvedValue(accessClaims({ 'cognito:groups': ['admin'] }));

    await expect(authenticator.authenticate('Bearer synthetic-test-token')).resolves.toEqual({
      subject: 'opaque-cognito-subject',
      role: 'admin',
    });
  });

  test('rejects a missing bearer token before verifier invocation', async () => {
    await expect(authenticator.authenticate(undefined)).rejects.toMatchObject({
      reasonCode: 'AUTH_MISSING_TOKEN',
    });
    expect(verify).not.toHaveBeenCalled();
  });

  test.each(['Basic token', 'bearer token', 'Bearer', 'Bearer token extra', 'Bearer token,other'])(
    'rejects malformed bearer syntax: %s',
    async (authorizationHeader) => {
      await expect(authenticator.authenticate(authorizationHeader)).rejects.toMatchObject({
        reasonCode: 'AUTH_INVALID_TOKEN',
      });
      expect(verify).not.toHaveBeenCalled();
    },
  );

  test.each(['malformed token', 'expired token', 'wrong client', 'wrong issuer or pool'])(
    'maps verifier rejection for %s to 401 authentication semantics',
    async () => {
      verify.mockRejectedValue(new Error('sensitive verifier detail'));

      await expect(
        authenticator.authenticate('Bearer synthetic-test-token'),
      ).rejects.toBeInstanceOf(OrderAuthenticationError);
    },
  );

  test('rejects an ID token or incorrect token_use', async () => {
    verify.mockResolvedValue(accessClaims({ token_use: 'id' }));

    await expect(authenticator.authenticate('Bearer synthetic-test-token')).rejects.toMatchObject({
      reasonCode: 'AUTH_WRONG_TOKEN_USE',
    });
  });

  test('rejects a token without the openid scope', async () => {
    verify.mockResolvedValue(accessClaims({ scope: 'email profile' }));

    await expect(authenticator.authenticate('Bearer synthetic-test-token')).rejects.toMatchObject({
      reasonCode: 'AUTH_MISSING_SCOPE',
    });
  });

  test.each([undefined, null, ''] as const)('rejects an invalid subject value %s', async (sub) => {
    verify.mockResolvedValue(accessClaims({ sub }));

    await expect(authenticator.authenticate('Bearer synthetic-test-token')).rejects.toBeInstanceOf(
      OrderAuthenticationError,
    );
  });

  test.each([
    ['missing groups', undefined],
    ['empty groups', []],
    ['unknown group', ['operator']],
    ['customer and admin ambiguity', ['customer', 'admin']],
    ['known and unknown group', ['customer', 'operator']],
    ['duplicate group', ['customer', 'customer']],
    ['malformed group claim', 'customer'],
  ])('rejects %s with 403 authorization semantics', async (_description, groups) => {
    verify.mockResolvedValue(accessClaims({ 'cognito:groups': groups }));

    await expect(authenticator.authenticate('Bearer synthetic-test-token')).rejects.toBeInstanceOf(
      OrderAuthorizationError,
    );
  });
});
