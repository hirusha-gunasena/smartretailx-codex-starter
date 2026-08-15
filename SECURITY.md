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

## Order API infrastructure security

- API Gateway is the only public Order API boundary. All three application routes require the
  existing Cognito JWT authorizer and `openid` scope; no `AuthorizationType: NONE` application route
  and no public `/health` route are defined.
- The ALB is internal. A dedicated VPC Link security group may reach only the ALB security group on
  port 80, and the ALB security group may reach only the task security group on port 3000. The task
  security group has no public ingress, even though development tasks use public IPs for NAT-free
  outbound connectivity.
- The ECS execution role is separate from the application task role. The execution role can pull
  only from the Order ECR repository and write the Order container log group. The task role permits
  only `dynamodb:GetItem`, `dynamodb:PutItem`, and `dynamodb:Scan` on the existing Orders table, plus
  `dynamodb:Query` on the exact `customerId-createdAt-index` ARN; it has no direct EventBridge
  publication permission.
- The container runs as non-root `node`, drops Linux capabilities, uses a read-only root filesystem,
  enables an init process, disables privileged mode and ECS Exec, and receives no credentials,
  tokens or secrets through environment variables. AWS SDK authentication comes from the task role.
- The private ECR repository uses immutable tags, rejects `latest` in deployment configuration,
  scans on push, expires untagged images after seven days, and retains at most ten images. A future
  gate must review scan results and verify the exact immutable image tag before deployment.
- API access logs and application logs exclude authorization headers, tokens, request bodies and
  claims. The API log captures operational request metadata; the container emits structured JSON.
- API and application JWT authentication are **IMPLEMENTED LOCALLY**. The backend independently
  verifies Cognito access-token signature, pool/issuer, public client, expiry, `token_use=access` and
  `openid`; it accepts exactly one supported Cognito group. Missing/invalid tokens return `401`,
  unsupported/ambiguous roles return `403`, and customer ownership mismatch returns the ordinary
  `404` to limit object-existence disclosure.
- The public create body is strict and excludes `customerId`; supplying one is a validation error.
  A customer UUID is derived from the verified opaque subject through a version-pinned namespaced
  UUID v5 mapping. Customers query only their GSI partition, while admins may Scan/read all but may
  not create Orders. No client-controlled identity or role header is trusted.
- Authorization telemetry contains only event, method, route template, decision, reason code,
  token-use indicator, subject/scope presence and normalized role. It must never contain a raw JWT,
  Authorization header, subject, email, password, PKCE material, complete claims or request body.
- `COGNITO_USER_POOL_ISSUER` and `COGNITO_USER_POOL_CLIENT_ID` are public verifier configuration,
  not credentials. JWT verification uses Cognito public JWKS and does not require Cognito Admin API
  permissions or static AWS credentials.
- The current development deployer still has a temporary `AdministratorAccess` exception from the
  controlled coursework deployment workflow. Task025 does not modify IAM. Replace that exception
  with reviewed least-privilege deployment permissions before finalization or any production-like
  use, and continue to prohibit root credentials.

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
