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
