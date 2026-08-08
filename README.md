# SmartRetailX

SmartRetailX is a cloud-native distributed retail platform implemented on AWS. The project demonstrates microservices, event-driven architecture, containerization, serverless computing, authentication, observability, resilience, performance testing, and infrastructure as code.

## Planned system

- React customer/admin frontend hosted with S3 and CloudFront or Amplify
- Cognito OAuth 2.0 / OIDC authentication with JWT-based RBAC
- Product Catalogue service on Lambda
- Order Processing service on ECS Fargate
- Inventory service consuming SQS events on Lambda
- Notification service consuming SQS events and publishing through SNS
- DynamoDB tables for products, orders, inventory, and idempotency records
- EventBridge, SQS queues, and DLQs for asynchronous workflows
- CDK v2 TypeScript infrastructure synthesized and deployed by CloudFormation
- CloudWatch metrics, logs, dashboards and alarms, plus X-Ray tracing

## Start here

1. Read `PROJECT_SPEC.md` and `ARCHITECTURE.md`.
2. Review `ROADMAP.md` and select the first incomplete milestone.
3. Give Codex one bounded task from `CODEX_TASKS.md`.
4. Never deploy before reviewing `cdk diff`.

## Local prerequisites

- Node.js 22 LTS or the repository-pinned version
- npm 10+
- Docker Desktop
- AWS CLI v2
- AWS CDK CLI v2
- Git
- Postman or Newman
- k6

## Initial commands

```bash
npm install
npm run format:check
npm run lint
npm run typecheck
npm test
```

## Security

Do not commit `.env`, AWS credentials, private keys, tokens, generated secrets, or deployment outputs containing sensitive identifiers. Use `.env.example` only as a schema.

## Dependency lockfile

This starter pack does not include a generated `package-lock.json`. Run `npm install` once in your normal development environment, review the resolved versions, and commit the generated lockfile before changing CI back to `npm ci`.
