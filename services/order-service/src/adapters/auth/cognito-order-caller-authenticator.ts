import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoAccessTokenPayload } from 'aws-jwt-verify/jwt-model';
import { CognitoJwtInvalidTokenUseError, JwtInvalidScopeError } from 'aws-jwt-verify/error';
import type {
  OrderCallerAuthenticator,
  OrderRole,
  VerifiedOrderCaller,
} from '../../application/ports/order-caller-authenticator.js';
import {
  OrderAuthenticationError,
  OrderAuthorizationError,
} from '../../domain/authorization-errors.js';

const BEARER_TOKEN_PATTERN = /^Bearer ([^\s,]+)$/u;

export interface CognitoAccessTokenVerifier {
  verify(token: string): Promise<unknown>;
}

interface VerifiedAccessTokenClaims {
  readonly token_use: unknown;
  readonly sub: unknown;
  readonly scope: unknown;
  readonly 'cognito:groups': unknown;
}

const isVerifiedAccessTokenClaims = (value: unknown): value is VerifiedAccessTokenClaims =>
  typeof value === 'object' && value !== null;

const roleFromGroups = (groups: unknown): OrderRole => {
  if (!Array.isArray(groups) || groups.length !== 1) {
    throw new OrderAuthorizationError('AUTH_INVALID_GROUPS');
  }

  const [role] = groups;
  if (role !== 'customer' && role !== 'admin') {
    throw new OrderAuthorizationError('AUTH_INVALID_GROUPS');
  }

  return role;
};

const accessTokenFromHeader = (authorizationHeader: string | undefined): string => {
  if (authorizationHeader === undefined) {
    throw new OrderAuthenticationError('AUTH_MISSING_TOKEN');
  }

  const match = BEARER_TOKEN_PATTERN.exec(authorizationHeader);
  if (match?.[1] === undefined) {
    throw new OrderAuthenticationError('AUTH_INVALID_TOKEN');
  }

  return match[1];
};

export class CognitoOrderCallerAuthenticator implements OrderCallerAuthenticator {
  public constructor(private readonly verifier: CognitoAccessTokenVerifier) {}

  public async authenticate(authorizationHeader: string | undefined): Promise<VerifiedOrderCaller> {
    const token = accessTokenFromHeader(authorizationHeader);
    let untrustedResult: unknown;

    try {
      untrustedResult = await this.verifier.verify(token);
    } catch (error) {
      if (error instanceof CognitoJwtInvalidTokenUseError) {
        throw new OrderAuthenticationError('AUTH_WRONG_TOKEN_USE');
      }
      if (error instanceof JwtInvalidScopeError) {
        throw new OrderAuthenticationError('AUTH_MISSING_SCOPE');
      }
      throw new OrderAuthenticationError('AUTH_INVALID_TOKEN');
    }

    if (!isVerifiedAccessTokenClaims(untrustedResult)) {
      throw new OrderAuthenticationError('AUTH_INVALID_TOKEN');
    }
    if (untrustedResult.token_use !== 'access') {
      throw new OrderAuthenticationError('AUTH_WRONG_TOKEN_USE');
    }
    if (typeof untrustedResult.sub !== 'string' || untrustedResult.sub.length === 0) {
      throw new OrderAuthenticationError('AUTH_INVALID_TOKEN');
    }
    if (
      typeof untrustedResult.scope !== 'string' ||
      !untrustedResult.scope.split(/\s+/u).includes('openid')
    ) {
      throw new OrderAuthenticationError('AUTH_MISSING_SCOPE');
    }

    return {
      subject: untrustedResult.sub,
      role: roleFromGroups(untrustedResult['cognito:groups']),
    };
  }
}

export interface AwsCognitoOrderAuthenticatorConfiguration {
  readonly userPoolId: string;
  readonly clientId: string;
}

export const createAwsCognitoOrderCallerAuthenticator = (
  configuration: AwsCognitoOrderAuthenticatorConfiguration,
): CognitoOrderCallerAuthenticator => {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: configuration.userPoolId,
    tokenUse: 'access',
    clientId: configuration.clientId,
    scope: 'openid',
    graceSeconds: 0,
    includeRawJwtInErrors: false,
  });

  return new CognitoOrderCallerAuthenticator({
    verify: async (token): Promise<CognitoAccessTokenPayload> => verifier.verify(token),
  });
};
