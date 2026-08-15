import { CatalogueAuthorizationError } from '../../domain/errors.js';

export const CATALOGUE_ROLES = {
  admin: 'admin',
  customer: 'customer',
} as const;

export type CatalogueRole = (typeof CATALOGUE_ROLES)[keyof typeof CATALOGUE_ROLES];
export type JwtClaimValue = string | number | boolean | string[];
export type JwtClaims = Readonly<Record<string, JwtClaimValue>>;

export interface CatalogueJwtClaims {
  readonly subject: string;
  readonly tokenUse: 'access';
  readonly scope: string;
  readonly groups: readonly CatalogueRole[];
}

const KNOWN_ROLES: ReadonlySet<string> = new Set(Object.values(CATALOGUE_ROLES));

const denyAccess = (): never => {
  throw new CatalogueAuthorizationError();
};

const parseGroups = (value: JwtClaimValue | undefined): readonly CatalogueRole[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return denyAccess();
  }

  if (value.some((group) => typeof group !== 'string' || !KNOWN_ROLES.has(group))) {
    return denyAccess();
  }

  return value as readonly CatalogueRole[];
};

export const authorizeCatalogueRequest = (
  claims: JwtClaims | undefined,
  permittedRoles: ReadonlySet<CatalogueRole>,
): CatalogueJwtClaims => {
  if (claims === undefined) {
    return denyAccess();
  }

  const subject = claims.sub;
  const tokenUse = claims.token_use;
  const scope = claims.scope;

  if (
    typeof subject !== 'string' ||
    subject.trim().length === 0 ||
    tokenUse !== 'access' ||
    typeof scope !== 'string' ||
    !scope.split(/\s+/u).includes('openid')
  ) {
    return denyAccess();
  }

  const groups = parseGroups(claims['cognito:groups']);
  if (!groups.some((group) => permittedRoles.has(group))) {
    return denyAccess();
  }

  return {
    subject,
    tokenUse,
    scope,
    groups,
  };
};
