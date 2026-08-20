import type { APIGatewayEventRequestContextJWTAuthorizer } from 'aws-lambda';
import { CatalogueAuthorizationError } from '../../domain/errors.js';

export const CATALOGUE_ROLES = {
  admin: 'admin',
  customer: 'customer',
} as const;

export const AUTHORIZATION_REASON_CODES = {
  allowed: 'AUTH_ALLOWED',
  insufficientRole: 'AUTH_INSUFFICIENT_ROLE',
  invalidGroupFormat: 'AUTH_INVALID_GROUP_FORMAT',
  invalidScopeFormat: 'AUTH_INVALID_SCOPE_FORMAT',
  invalidSubject: 'AUTH_INVALID_SUBJECT',
  missingContext: 'AUTH_MISSING_CONTEXT',
  missingScope: 'AUTH_MISSING_SCOPE',
  unknownGroup: 'AUTH_UNKNOWN_GROUP',
  wrongTokenUse: 'AUTH_WRONG_TOKEN_USE',
} as const;

export type CatalogueRole = (typeof CATALOGUE_ROLES)[keyof typeof CATALOGUE_ROLES];
export type AuthorizationReasonCode =
  (typeof AUTHORIZATION_REASON_CODES)[keyof typeof AUTHORIZATION_REASON_CODES];
export type JwtClaimValue = APIGatewayEventRequestContextJWTAuthorizer['jwt']['claims'][string];
export type JwtClaims = Readonly<APIGatewayEventRequestContextJWTAuthorizer['jwt']['claims']>;

export interface JwtAuthorizerContext {
  readonly claims?: JwtClaims;
  readonly scopes?: readonly string[];
}

export interface CatalogueAuthorizationContext {
  readonly subject: string;
  readonly tokenUse: 'access';
  readonly scopes: readonly string[];
  readonly groups: readonly CatalogueRole[];
}

export type CatalogueJwtClaims = CatalogueAuthorizationContext;

export interface AuthorizationRequestMetadata {
  readonly requestId: string;
  readonly routeKey: string;
}

type AuthorizationDecision = 'ALLOW' | 'DENY';
type GroupsClaimType = 'array' | 'missing' | 'other' | 'string';
type GroupsParsingResult =
  'DUPLICATE' | 'EMPTY' | 'MALFORMED' | 'MISSING' | 'NOT_ATTEMPTED' | 'UNKNOWN_GROUP' | 'VALID';

export interface AuthorizationDecisionLog {
  readonly event: 'catalogue.authorization';
  readonly requestId: string;
  readonly routeKey: string;
  readonly decision: AuthorizationDecision;
  readonly reasonCode: AuthorizationReasonCode;
  readonly tokenUse: string | null;
  readonly subjectPresent: boolean;
  readonly scopeCount: number;
  readonly recognizedGroups: readonly CatalogueRole[];
  readonly groupsClaimType: GroupsClaimType;
  readonly groupsParsingResult: GroupsParsingResult;
}

export type AuthorizationDecisionLogger = (entry: AuthorizationDecisionLog) => void;

interface AuthorizationDiagnostics {
  readonly tokenUse: string | null;
  readonly subjectPresent: boolean;
  readonly scopeCount: number;
  readonly recognizedGroups: readonly CatalogueRole[];
  readonly groupsClaimType: GroupsClaimType;
  readonly groupsParsingResult: GroupsParsingResult;
}

export type AuthorizationContextExtractionResult =
  | {
      readonly success: true;
      readonly context: CatalogueAuthorizationContext;
      readonly diagnostics: AuthorizationDiagnostics;
    }
  | {
      readonly success: false;
      readonly reasonCode: Exclude<
        AuthorizationReasonCode,
        'AUTH_ALLOWED' | 'AUTH_INSUFFICIENT_ROLE'
      >;
      readonly diagnostics: AuthorizationDiagnostics;
    };

interface GroupNormalizationSuccess {
  readonly success: true;
  readonly groups: readonly CatalogueRole[];
  readonly claimType: GroupsClaimType;
  readonly parsingResult: 'VALID';
}

interface GroupNormalizationFailure {
  readonly success: false;
  readonly reasonCode: 'AUTH_INVALID_GROUP_FORMAT' | 'AUTH_UNKNOWN_GROUP';
  readonly recognizedGroups: readonly CatalogueRole[];
  readonly claimType: GroupsClaimType;
  readonly parsingResult: Exclude<GroupsParsingResult, 'NOT_ATTEMPTED' | 'VALID'>;
}

type GroupNormalizationResult = GroupNormalizationSuccess | GroupNormalizationFailure;

const KNOWN_ROLES: ReadonlySet<string> = new Set(Object.values(CATALOGUE_ROLES));

const getGroupsClaimType = (value: unknown): GroupsClaimType => {
  if (value === undefined) {
    return 'missing';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value === 'string' ? 'string' : 'other';
};

const invalidGroups = (
  claimType: GroupsClaimType,
  parsingResult: GroupNormalizationFailure['parsingResult'],
  recognizedGroups: readonly CatalogueRole[] = [],
): GroupNormalizationFailure => ({
  success: false,
  reasonCode:
    parsingResult === 'UNKNOWN_GROUP'
      ? AUTHORIZATION_REASON_CODES.unknownGroup
      : AUTHORIZATION_REASON_CODES.invalidGroupFormat,
  recognizedGroups,
  claimType,
  parsingResult,
});

const normalizeGroupValues = (
  values: readonly unknown[],
  claimType: 'array' | 'string',
): GroupNormalizationResult => {
  if (values.length === 0) {
    return invalidGroups(claimType, 'EMPTY');
  }

  if (values.some((group) => typeof group !== 'string' || group.length === 0)) {
    return invalidGroups(claimType, 'MALFORMED');
  }

  const groups = values as readonly string[];
  if (new Set(groups).size !== groups.length) {
    return invalidGroups(claimType, 'DUPLICATE');
  }

  const recognizedGroups = groups.filter((group): group is CatalogueRole => KNOWN_ROLES.has(group));
  if (recognizedGroups.length !== groups.length) {
    return invalidGroups(claimType, 'UNKNOWN_GROUP', recognizedGroups);
  }

  return {
    success: true,
    groups: recognizedGroups,
    claimType,
    parsingResult: 'VALID',
  };
};

export const normalizeCognitoGroups = (rawClaim: unknown): GroupNormalizationResult => {
  const claimType = getGroupsClaimType(rawClaim);

  if (claimType === 'missing') {
    return invalidGroups(claimType, 'MISSING');
  }

  if (claimType === 'array') {
    return normalizeGroupValues(rawClaim as readonly unknown[], claimType);
  }

  if (claimType !== 'string') {
    return invalidGroups(claimType, 'MALFORMED');
  }

  const serializedGroups = rawClaim as string;
  if (!serializedGroups.startsWith('[') || !serializedGroups.endsWith(']')) {
    return invalidGroups(claimType, 'MALFORMED');
  }

  const content = serializedGroups.slice(1, -1).trim();
  if (content.length === 0) {
    return invalidGroups(claimType, 'EMPTY');
  }

  const parsedGroups = content.split(',').map((group) => group.trim());
  if (parsedGroups.some((group) => /["']/u.test(group))) {
    return invalidGroups(claimType, 'MALFORMED');
  }

  return normalizeGroupValues(parsedGroups, claimType);
};

const createDiagnostics = (
  jwtAuthorizer: JwtAuthorizerContext | undefined,
): AuthorizationDiagnostics => {
  const claims = jwtAuthorizer?.claims;
  const subject = claims?.sub;
  const tokenUse = claims?.token_use;
  const rawScopes: unknown = jwtAuthorizer?.scopes;

  return {
    tokenUse: typeof tokenUse === 'string' ? tokenUse : null,
    subjectPresent: typeof subject === 'string' && subject.trim().length > 0,
    scopeCount: Array.isArray(rawScopes) ? rawScopes.length : 0,
    recognizedGroups: [],
    groupsClaimType: getGroupsClaimType(claims?.['cognito:groups']),
    groupsParsingResult: 'NOT_ATTEMPTED',
  };
};

const extractionFailure = (
  reasonCode: Exclude<AuthorizationReasonCode, 'AUTH_ALLOWED' | 'AUTH_INSUFFICIENT_ROLE'>,
  diagnostics: AuthorizationDiagnostics,
): AuthorizationContextExtractionResult => ({ success: false, reasonCode, diagnostics });

export const extractAuthorizationContext = (
  jwtAuthorizer: JwtAuthorizerContext | undefined,
): AuthorizationContextExtractionResult => {
  const diagnostics = createDiagnostics(jwtAuthorizer);
  const claims = jwtAuthorizer?.claims;

  if (claims === undefined) {
    return extractionFailure(AUTHORIZATION_REASON_CODES.missingContext, diagnostics);
  }

  const subject = claims.sub;
  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return extractionFailure(AUTHORIZATION_REASON_CODES.invalidSubject, diagnostics);
  }

  if (claims.token_use !== 'access') {
    return extractionFailure(AUTHORIZATION_REASON_CODES.wrongTokenUse, diagnostics);
  }

  const rawScopes: unknown = jwtAuthorizer?.scopes;
  if (rawScopes === undefined) {
    return extractionFailure(AUTHORIZATION_REASON_CODES.missingScope, diagnostics);
  }

  if (
    !Array.isArray(rawScopes) ||
    rawScopes.some((scope) => typeof scope !== 'string' || scope.length === 0)
  ) {
    return extractionFailure(AUTHORIZATION_REASON_CODES.invalidScopeFormat, diagnostics);
  }

  const scopes = rawScopes as readonly string[];
  if (!scopes.includes('openid')) {
    return extractionFailure(AUTHORIZATION_REASON_CODES.missingScope, diagnostics);
  }

  const groupResult = normalizeCognitoGroups(claims['cognito:groups']);
  const groupDiagnostics: AuthorizationDiagnostics = {
    ...diagnostics,
    recognizedGroups: groupResult.success ? groupResult.groups : groupResult.recognizedGroups,
    groupsClaimType: groupResult.claimType,
    groupsParsingResult: groupResult.parsingResult,
  };

  if (!groupResult.success) {
    return extractionFailure(groupResult.reasonCode, groupDiagnostics);
  }

  return {
    success: true,
    context: {
      subject,
      tokenUse: 'access',
      scopes: [...scopes],
      groups: [...groupResult.groups],
    },
    diagnostics: groupDiagnostics,
  };
};

export const writeAuthorizationDecisionLog: AuthorizationDecisionLogger = (entry) => {
  console.info(JSON.stringify(entry));
};

const logDecision = (
  metadata: AuthorizationRequestMetadata,
  decision: AuthorizationDecision,
  reasonCode: AuthorizationReasonCode,
  diagnostics: AuthorizationDiagnostics,
  logger: AuthorizationDecisionLogger,
): void => {
  logger({
    event: 'catalogue.authorization',
    requestId: metadata.requestId,
    routeKey: metadata.routeKey,
    decision,
    reasonCode,
    ...diagnostics,
  });
};

export const authorizeCatalogueRequest = (
  jwtAuthorizer: JwtAuthorizerContext | undefined,
  permittedRoles: ReadonlySet<CatalogueRole>,
  metadata: AuthorizationRequestMetadata,
  logger: AuthorizationDecisionLogger = writeAuthorizationDecisionLog,
): CatalogueAuthorizationContext => {
  const extraction = extractAuthorizationContext(jwtAuthorizer);

  if (!extraction.success) {
    logDecision(metadata, 'DENY', extraction.reasonCode, extraction.diagnostics, logger);
    throw new CatalogueAuthorizationError();
  }

  if (!extraction.context.groups.some((group) => permittedRoles.has(group))) {
    logDecision(
      metadata,
      'DENY',
      AUTHORIZATION_REASON_CODES.insufficientRole,
      extraction.diagnostics,
      logger,
    );
    throw new CatalogueAuthorizationError();
  }

  logDecision(
    metadata,
    'ALLOW',
    AUTHORIZATION_REASON_CODES.allowed,
    extraction.diagnostics,
    logger,
  );
  return extraction.context;
};
