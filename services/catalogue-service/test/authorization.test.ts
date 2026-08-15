import { describe, expect, test } from '@jest/globals';
import {
  AUTHORIZATION_REASON_CODES,
  authorizeCatalogueRequest,
  CATALOGUE_ROLES,
  CatalogueAuthorizationError,
} from '../src/index.js';
import type {
  AuthorizationDecisionLog,
  AuthorizationDecisionLogger,
  JwtAuthorizerContext,
  JwtClaims,
} from '../src/index.js';

const CUSTOMER_OR_ADMIN = new Set([CATALOGUE_ROLES.customer, CATALOGUE_ROLES.admin]);
const ADMIN_ONLY = new Set([CATALOGUE_ROLES.admin]);
const REQUEST_METADATA = {
  requestId: 'authorization-request-123',
  routeKey: 'GET /api/v1/products',
} as const;
const SCOPES = ['openid', 'email', 'profile'] as const;

const claimsFor = (groups: JwtClaims[string] = '[customer]'): JwtClaims => ({
  sub: 'user-123',
  token_use: 'access',
  'cognito:groups': groups,
});

const jwtFor = (
  groups: JwtClaims[string] = '[customer]',
  scopes: readonly string[] = SCOPES,
): JwtAuthorizerContext => ({ claims: claimsFor(groups), scopes });

const unsafeJwt = (value: unknown): JwtAuthorizerContext => value as JwtAuthorizerContext;

const createLogCapture = (): {
  readonly entries: AuthorizationDecisionLog[];
  readonly logger: AuthorizationDecisionLogger;
} => {
  const entries: AuthorizationDecisionLog[] = [];
  return { entries, logger: (entry) => entries.push(entry) };
};

const authorize = (
  jwtAuthorizer: JwtAuthorizerContext | undefined,
  permittedRoles: ReadonlySet<
    (typeof CATALOGUE_ROLES)[keyof typeof CATALOGUE_ROLES]
  > = CUSTOMER_OR_ADMIN,
  logger: AuthorizationDecisionLogger = () => undefined,
) => authorizeCatalogueRequest(jwtAuthorizer, permittedRoles, REQUEST_METADATA, logger);

describe('Catalogue HTTP API JWT authorization context', () => {
  test('allows a customer string claim from an HTTP API v2 event to read', () => {
    expect(authorize(jwtFor('[customer]'))).toEqual({
      subject: 'user-123',
      tokenUse: 'access',
      scopes: SCOPES,
      groups: ['customer'],
    });
  });

  test('allows an admin string claim to read and write', () => {
    expect(() => authorize(jwtFor('[admin]'), CUSTOMER_OR_ADMIN)).not.toThrow();
    expect(() => authorize(jwtFor('[admin]'), ADMIN_ONLY)).not.toThrow();
  });

  test('preserves native string-array compatibility at the boundary', () => {
    expect(authorize(jwtFor(['customer']))).toEqual(
      expect.objectContaining({ groups: ['customer'] }),
    );
  });

  test('allows both recognized groups in a supported serialized claim', () => {
    expect(() => authorize(jwtFor('[customer, admin]'), ADMIN_ONLY)).not.toThrow();
  });

  test('uses the HTTP API jwt.scopes collection instead of claims.scope', () => {
    expect(claimsFor('[customer]')).not.toHaveProperty('scope');
    expect(() => authorize(jwtFor('[customer]'))).not.toThrow();
  });

  test('denies a customer write with an insufficient-role reason', () => {
    const capture = createLogCapture();

    expect(() => authorize(jwtFor('[customer]'), ADMIN_ONLY, capture.logger)).toThrow(
      CatalogueAuthorizationError,
    );
    expect(capture.entries).toEqual([
      expect.objectContaining({
        decision: 'DENY',
        reasonCode: AUTHORIZATION_REASON_CODES.insufficientRole,
        recognizedGroups: ['customer'],
      }),
    ]);
  });

  test.each<[string, JwtAuthorizerContext | undefined]>([
    ['missing JWT context', undefined],
    ['missing claims', {}],
  ])('denies %s', (_description, jwtAuthorizer) => {
    expect(() => authorize(jwtAuthorizer)).toThrow(CatalogueAuthorizationError);
  });

  test.each<[string, JwtClaims]>([
    ['missing', { token_use: 'access', 'cognito:groups': '[customer]' }],
    ['empty', { ...claimsFor('[customer]'), sub: '' }],
    ['whitespace-only', { ...claimsFor('[customer]'), sub: '   ' }],
    ['non-string', { ...claimsFor('[customer]'), sub: 123 }],
  ])('denies a %s subject', (_description, claims) => {
    expect(() => authorize({ claims, scopes: SCOPES })).toThrow(CatalogueAuthorizationError);
  });

  test.each<[string, JwtClaims]>([
    ['ID token', { ...claimsFor('[admin]'), token_use: 'id' }],
    ['missing token_use', { sub: 'user-123', 'cognito:groups': '[admin]' } as JwtClaims],
    ['non-string token_use', { ...claimsFor('[admin]'), token_use: true }],
  ])('denies %s', (_description, claims) => {
    expect(() => authorize({ claims, scopes: SCOPES })).toThrow(CatalogueAuthorizationError);
  });

  test('denies missing scopes', () => {
    expect(() => authorize({ claims: claimsFor('[customer]') })).toThrow(
      CatalogueAuthorizationError,
    );
  });

  test.each<[string, unknown]>([
    ['a string', { claims: claimsFor('[customer]'), scopes: 'openid email profile' }],
    ['a non-string member', { claims: claimsFor('[customer]'), scopes: ['openid', 42] }],
    ['an empty member', { claims: claimsFor('[customer]'), scopes: ['openid', ''] }],
  ])('denies malformed scopes represented as %s', (_description, jwtAuthorizer) => {
    expect(() => authorize(unsafeJwt(jwtAuthorizer))).toThrow(CatalogueAuthorizationError);
  });

  test('denies scopes without openid', () => {
    expect(() => authorize(jwtFor('[customer]', ['email', 'profile']))).toThrow(
      CatalogueAuthorizationError,
    );
  });

  test.each<[string, JwtClaims]>([
    ['missing groups', { sub: 'user-123', token_use: 'access' }],
    ['plain unframed role string', { ...claimsFor('[admin]'), 'cognito:groups': 'admin' }],
    ['empty serialized groups', { ...claimsFor('[admin]'), 'cognito:groups': '[]' }],
    ['malformed opening bracket', { ...claimsFor('[admin]'), 'cognito:groups': '[admin' }],
    ['malformed closing bracket', { ...claimsFor('[admin]'), 'cognito:groups': 'admin]' }],
    ['JSON-string serialization', { ...claimsFor('[admin]'), 'cognito:groups': '["admin"]' }],
    ['non-string claim', { ...claimsFor('[admin]'), 'cognito:groups': 123 }],
    ['empty array', { ...claimsFor('[admin]'), 'cognito:groups': [] }],
    ['array with an empty role', { ...claimsFor('[admin]'), 'cognito:groups': [''] }],
    ['duplicate serialized roles', { ...claimsFor('[admin]'), 'cognito:groups': '[admin, admin]' }],
  ])('denies %s', (_description, claims) => {
    expect(() => authorize({ claims, scopes: SCOPES })).toThrow(CatalogueAuthorizationError);
  });

  test.each([
    ['unknown group', '[support]'],
    ['known and unknown groups', '[admin, support]'],
    ['superadmin substring', '[superadmin]'],
    ['customer-old substring', '[customer-old]'],
  ])('denies %s', (_description, groups) => {
    expect(() => authorize(jwtFor(groups))).toThrow(CatalogueAuthorizationError);
  });

  test('does not silently discard an unknown group beside a known group', () => {
    const capture = createLogCapture();

    expect(() => authorize(jwtFor('[admin, support]'), ADMIN_ONLY, capture.logger)).toThrow(
      CatalogueAuthorizationError,
    );
    expect(capture.entries).toEqual([
      expect.objectContaining({
        reasonCode: AUTHORIZATION_REASON_CODES.unknownGroup,
        recognizedGroups: ['admin'],
        groupsClaimType: 'string',
        groupsParsingResult: 'UNKNOWN_GROUP',
      }),
    ]);
  });

  test('logs one sanitized structured allow decision', () => {
    const capture = createLogCapture();

    authorize(jwtFor('[customer]'), CUSTOMER_OR_ADMIN, capture.logger);

    expect(capture.entries).toEqual([
      {
        event: 'catalogue.authorization',
        requestId: REQUEST_METADATA.requestId,
        routeKey: REQUEST_METADATA.routeKey,
        decision: 'ALLOW',
        reasonCode: AUTHORIZATION_REASON_CODES.allowed,
        tokenUse: 'access',
        subjectPresent: true,
        scopeCount: 3,
        recognizedGroups: ['customer'],
        groupsClaimType: 'string',
        groupsParsingResult: 'VALID',
      },
    ]);
    expect(JSON.stringify(capture.entries)).not.toContain('Authorization');
    expect(JSON.stringify(capture.entries)).not.toContain('Bearer');
  });
});
