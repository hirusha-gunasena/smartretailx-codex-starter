import { describe, expect, test } from '@jest/globals';
import {
  authorizeCatalogueRequest,
  CATALOGUE_ROLES,
  CatalogueAuthorizationError,
  type JwtClaims,
} from '../src/index.js';

const CUSTOMER_OR_ADMIN = new Set([CATALOGUE_ROLES.customer, CATALOGUE_ROLES.admin]);
const ADMIN_ONLY = new Set([CATALOGUE_ROLES.admin]);

const claimsFor = (groups: string[]): JwtClaims => ({
  sub: 'user-123',
  token_use: 'access',
  scope: 'openid email profile',
  'cognito:groups': groups,
});

describe('Catalogue JWT claim authorization', () => {
  test('allows a customer to read', () => {
    expect(authorizeCatalogueRequest(claimsFor(['customer']), CUSTOMER_OR_ADMIN)).toEqual({
      subject: 'user-123',
      tokenUse: 'access',
      scope: 'openid email profile',
      groups: ['customer'],
    });
  });

  test('allows an admin to read and write', () => {
    expect(() => authorizeCatalogueRequest(claimsFor(['admin']), CUSTOMER_OR_ADMIN)).not.toThrow();
    expect(() => authorizeCatalogueRequest(claimsFor(['admin']), ADMIN_ONLY)).not.toThrow();
  });

  test('allows a user with both recognized groups', () => {
    expect(() =>
      authorizeCatalogueRequest(claimsFor(['customer', 'admin']), ADMIN_ONLY),
    ).not.toThrow();
  });

  test('denies a customer write', () => {
    expect(() => authorizeCatalogueRequest(claimsFor(['customer']), ADMIN_ONLY)).toThrow(
      CatalogueAuthorizationError,
    );
  });

  test('denies missing groups', () => {
    const claims = claimsFor(['customer']);
    const { ['cognito:groups']: ignored, ...withoutGroups } = claims;
    expect(ignored).toBeDefined();

    expect(() => authorizeCatalogueRequest(withoutGroups, CUSTOMER_OR_ADMIN)).toThrow(
      CatalogueAuthorizationError,
    );
  });

  test.each([
    ['missing claims', undefined],
    ['an ID token', { ...claimsFor(['admin']), token_use: 'id' }],
    ['a missing subject', { ...claimsFor(['admin']), sub: '' }],
    ['a missing required scope', { ...claimsFor(['admin']), scope: 'email profile' }],
    ['a string group representation', { ...claimsFor(['admin']), 'cognito:groups': 'admin' }],
    ['an unknown group', claimsFor(['support'])],
    ['a known and an unknown group', claimsFor(['admin', 'support'])],
  ])('fails closed for %s', (_description, claims) => {
    expect(() => authorizeCatalogueRequest(claims, CUSTOMER_OR_ADMIN)).toThrow(
      CatalogueAuthorizationError,
    );
  });
});
