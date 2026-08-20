# Deployment Guide

## Safety sequence

```bash
aws sts get-caller-identity
aws configure get region
npm install
npm run build
npm run cdk:synth
npm run cdk:diff
```

Review the account, region, expected resources and cost implications before deployment.

## Deployment

Deployment must be explicit and approved:

```bash
npm run cdk:deploy
```

## Cleanup

Use stack-specific destruction only after reviewing retained data:

```bash
npm run cdk:destroy
```

DynamoDB tables, S3 buckets and retained logs may require deliberate cleanup decisions.

## Environments

- `dev`: low-cost, short log retention, removable resources
- `test`: isolated automated tests
- `prod-demo`: stable assessment demonstration, protected data where practical

Never share deployment outputs containing secrets. API URLs and public identifiers may be documented after review.

## Task018 authentication deployment gate

Task018 is currently implemented in CDK and is **not deployed**. Local synth creates a proposed
`SmartRetailX-dev-Auth` template and adds cross-stack references from
`SmartRetailX-dev-Catalogue`; it does not create Cognito resources.

Before any future deployment:

1. Confirm the intended AWS identity and `ap-south-1` region with read-only CLI commands.
2. Run all repository checks and synth.
3. Review a stack-scoped CDK diff for `SmartRetailX-dev-Auth` and
   `SmartRetailX-dev-Catalogue`, including replacements and cross-stack exports.
4. Confirm the Cognito domain prefix is available and the callback/logout URLs are correct for the
   target environment.
5. Record explicit deployment approval and a cost note. Cognito pricing depends on active users and
   optional features; Task018 adds no Identity Pool, SMS role, VPC, NAT Gateway or custom domain.
6. Deploy Auth before the dependent Catalogue stack, using stack-scoped commands rather than an
   unreviewed all-stack deployment.

After an approved deployment, verify the CloudFormation stack status, User Pool configuration,
public client settings, domain, group precedence, API Gateway JWT authorizer issuer/audience and all
five protected route configurations using read-only AWS CLI calls. Then perform separate approved
negative and role-based API tests. That later test gate must deliberately create one temporary
customer test user and one temporary admin test user, assign the exact `customer` and `admin` groups,
authenticate each through Cognito Authorization Code + PKCE, obtain access tokens and exercise the
route matrix. Do not create those identities during infrastructure verification, put passwords in
documentation/source control, expose tokens or capture raw authorization headers.

The User Pool ID, public client ID, Cognito domain, issuer and callback URL are integration values,
not credentials. Even so, keep captured deployment evidence free of access tokens, authorization
codes, PKCE verifiers, passwords and raw API authorization headers.

## Future controlled Task024 Order deployment sequence

The first published Order image (`6eacebe2fa18289a09a75e7124429ebe6fddf890`, digest
`sha256:a2410b9a1b2781eb3b10bce7f29ea35e66f112a640b7b3e17b66c6ef158fcafd`) is blocked and retained
as evidence because ECR basic scanning reported three CRITICAL and five HIGH findings inherited
from Debian `perl-base`. Do not delete, overwrite, retag, suppress findings for, or deploy that
artifact. Task027A changes the local runtime base to a digest-pinned official Node.js 22 Alpine 3.24
image without compatibility packages. A later, separately approved publication task must clean-build
from the new committed SHA, use that new full SHA as the only ECR tag, and require CRITICAL=0 and
HIGH=0 from the existing ECR basic scan-on-push gate before Task028 can be considered.

Task024 is implemented and reviewed locally only. The commands below describe a future controlled
gate; do not run them without fresh identity, region, health, cost, diff and explicit mutation
approval. Replace angle-bracket values deliberately—never use the synth-only placeholder or
`latest`.

1. Re-run the complete quality gate and template-only regression diffs for all stacks. The
   `OrderEvents` diff must contain only the one `customerId-createdAt-index` GSI and strictly
   necessary attribute definitions; it must not replace the GlobalTable or alter its primary key,
   billing, stream, removal, replica or relay resources.
2. Obtain explicit approval for the GSI mutation, then deploy only
   `SmartRetailX-dev-OrderEvents`:

   ```powershell
   npx cdk deploy SmartRetailX-dev-OrderEvents --exclusively --profile smartretailx-deploy
   ```

3. Wait for the CloudFormation stack to reach a stable successful state, then poll DynamoDB
   `DescribeTable` until the exact index is active:

   ```powershell
   aws dynamodb describe-table --table-name smartretailx-orders-dev --query "Table.GlobalSecondaryIndexes[?IndexName=='customerId-createdAt-index'].IndexStatus" --region ap-south-1 --profile smartretailx-deploy
   ```

   Do not continue merely because CloudFormation reports `UPDATE_COMPLETE`; the GSI must report
   `ACTIVE`. Stop on a failed stack, missing index, unexpected table change or non-active index.

4. Re-run the controlled Saga success/rejection/idempotency verification appropriate to the gate,
   confirm the six existing application stacks remain healthy, and obtain separate approval before
   proceeding to container infrastructure.
5. Review and explicitly approve deployment of only `SmartRetailX-dev-OrderRegistry`:

   ```powershell
   npx cdk deploy SmartRetailX-dev-OrderRegistry --profile smartretailx-deploy
   ```

6. Verify the private repository, immutable tags, scan-on-push and lifecycle configuration.
7. Build and tag the exact source revision from the repository root. This must be a new committed
   SHA; never reuse the blocked SHA or retag a pre-commit local candidate:

   ```powershell
   $orderImageTag = git rev-parse HEAD
   docker build --pull --file domains/order/service/Dockerfile --tag "smartretailx-order-service:$orderImageTag" .
   $registryHost = "<account-id>.dkr.ecr.ap-south-1.amazonaws.com"
   aws ecr get-login-password --region ap-south-1 --profile smartretailx-deploy | docker login --username AWS --password-stdin $registryHost
   docker tag "smartretailx-order-service:$orderImageTag" "$registryHost/smartretailx-order-service-dev:$orderImageTag"
   docker push "$registryHost/smartretailx-order-service-dev:$orderImageTag"
   ```

8. Verify that exact immutable tag exists and that its Linux/amd64 runtime scan is complete with no
   critical or high findings. This command is read-only and exits unsuccessfully when the tag is
   absent or the security gate fails:

   ```powershell
   node --loader ts-node/esm infrastructure/bin/verify-order-image.ts --tag $orderImageTag --profile smartretailx-deploy --region ap-south-1
   ```

9. Supply that full Git SHA through CDK context as `orderImageTag`, re-run synthesis, and review a
   stack-scoped template-only diff for `SmartRetailX-dev-OrderService`.
10. Obtain separate explicit approval before deploying only the service stack:

```powershell
npx cdk deploy SmartRetailX-dev-OrderService --context "orderImageTag=$orderImageTag" --profile smartretailx-deploy
```

11. Verify ECS stabilization, internal ALB target health, API Gateway/JWT configuration, logs, all
    eight stack states and zero regression diffs before any separately approved HTTP mutation test.

Do not deploy `OrderService` when the image tag is absent, `latest`, the placeholder, missing from
ECR, or fails the approved scan policy; when Auth or the Orders table is unhealthy; when an existing
Saga stack has a material diff; when the ALB is internet-facing; when an application route is
unauthenticated; or before the customer index reports `ACTIVE`. Never combine the GSI, registry,
image push and OrderService rollout into one approval or mutation step.
