# Security Policy and Engineering Requirements

## Secrets

- Never commit credentials, keys, tokens, passwords, private certificates or real `.env` files.
- Use Secrets Manager for runtime secrets.
- Use IAM roles for AWS service access.
- Rotate any credential that is exposed accidentally.

## Identity

- The development `AuthStack` owns one Cognito User Pool, a Cognito-owned domain and one public SPA
  client. The client has no secret and uses OAuth 2.0 Authorization Code Grant with PKCE; implicit
  and client-credentials grants are disabled.
- Cognito accepts verified email addresses for sign-in and self-service registration. Passwords
  require at least 12 characters with upper case, lower case, digit and symbol. Optional MFA uses
  software TOTP only; SMS MFA and its IAM/SNS role are disabled.
- The public client requests only `openid`, `email` and `profile`. Access and ID tokens expire after
  60 minutes, refresh tokens after seven days, and token revocation is enabled.
- Development callback and logout URLs are centralized in infrastructure configuration. They use
  localhost only and must be replaced by explicitly reviewed HTTPS URLs for a hosted environment.
- Never place OAuth tokens, authorization codes, PKCE verifiers or Cognito user passwords in source,
  documentation, `.env` files, logs or CloudFormation outputs.

## Catalogue authorization

- API Gateway is the cryptographic trust boundary. Every Catalogue route uses the same JWT
  authorizer, with the Cognito User Pool issuer, SPA client ID audience and required `openid` scope.
- Catalogue Lambda does not decode or verify JWT signatures and has no JWKS or JWT-library
  dependency. It consumes only API Gateway's validated
  `requestContext.authorizer.jwt.claims` values.
- The application accepts access tokens only (`token_use=access`) and explicitly validates `sub`,
  `scope` and `cognito:groups` before calling application or persistence code.
- Exact group names are `customer` and `admin`. Both may read Catalogue products; only `admin` may
  create, update or delete them. The groups confer application roles only and have no IAM roles.
- Missing claims, missing groups, malformed group representations, ID-token claims and unrecognized
  groups fail closed with the standard `403 FORBIDDEN` API error response. API Gateway rejects
  missing, invalid, expired, wrong-issuer or wrong-audience JWTs before Lambda invocation.
- API Gateway returns `401` for absent or invalid authentication and `403` when a validated access
  token lacks the required route scope. Lambda returns `403` when authenticated claims do not grant
  the requested application operation.
- Catalogue Lambda needs no Cognito API permissions: authentication requires no per-request Cognito
  call, and its existing application IAM remains limited to logging and the Products table actions.
- Task018 defines no users and stores no credentials. Group membership is an operational identity
  administration action and is outside the implementation task.
- A later live gate must use short-lived coursework test users created outside source control, assign
  exact groups deliberately, obtain access tokens through code/PKCE and remove or disable users under
  a separately approved cleanup plan. Task018 is currently local-only; Auth and secure Catalogue are
  not deployed. A hosted environment will require reviewed HTTPS callbacks and a decision on whether
  to keep the Cognito-owned domain or introduce a separately reviewed custom domain.

## IAM

- Grant actions only on required resources.
- Separate Lambda execution roles, ECS task roles and deployment roles.
- Avoid broad managed policies in final stacks.

## Data

- Encrypt DynamoDB, S3, queues and logs at rest.
- Require TLS in transit.
- Avoid storing payment-card data; the payment integration is simulated.
- Minimize personal data and define retention policies.

## Reporting

Do not create public security issues containing secrets or exploitable production details. Record academic security findings in the private project evidence directory.
