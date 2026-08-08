# SmartRetailX Codex Instructions

## Mission

Build SmartRetailX as a secure, observable, event-driven AWS distributed web application. Work incrementally, keep every change reviewable, and preserve a working repository after each task.

## Mandatory stack

- TypeScript with `strict: true`
- Node.js for all backend services
- React + Vite for the web application
- AWS SDK for JavaScript v3
- AWS CDK v2 in TypeScript; CloudFormation is the deployment engine
- API Gateway HTTP API, Lambda, ECS Fargate, DynamoDB, S3, EventBridge, SQS, SNS, Cognito, CloudWatch and X-Ray
- Jest for unit tests, Supertest for HTTP tests, Newman for Postman collections, and k6 for performance tests

## Architecture rules

1. Services:
   - Product Catalogue: Lambda + API Gateway + DynamoDB + S3
   - Order Processing: Express container on ECS Fargate behind an ALB
   - Inventory Management: SQS-triggered Lambda + DynamoDB
   - Notification: SQS-triggered Lambda + SNS
2. Every service owns its data access. Do not let one service directly modify another service's table except through a deliberately documented workflow.
3. All public APIs are versioned under `/api/v1`.
4. All asynchronous events include `eventId`, `eventType`, `eventVersion`, `occurredAt`, `source`, `correlationId`, and `data`.
5. Every SQS queue must have a DLQ.
6. Every event consumer must be idempotent.
7. Do not hardcode AWS account IDs, ARNs, secrets, passwords, tokens, regions, or endpoint URLs.
8. Use IAM roles and least-privilege policies. Never create or store long-lived AWS credentials in the repository.
9. Use structured JSON logging and propagate `requestId`, `correlationId`, and `eventId`.
10. Add health endpoints for containerized services.

## Coding rules

- Prefer small modules and explicit dependencies.
- Validate external input with Zod.
- Use typed domain errors and consistent API error responses.
- Avoid `any`; justify exceptions inline.
- Add unit tests for business rules and integration tests for AWS boundaries.
- Keep generated build outputs and secrets out of Git.
- Do not edit files unrelated to the assigned task.

## Required checks before completion

Run the relevant subset and report results:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

For infrastructure changes also run:

```bash
npm run cdk:synth
npm run cdk:diff
```

Do not run `cdk deploy` unless the user explicitly approves the reviewed diff.

## Deployment safety

- First run `aws sts get-caller-identity` and confirm the target account and region.
- Never deploy chargeable infrastructure without a cost note.
- Apply tags: `Project=SmartRetailX`, `Environment`, `Owner`, and `ManagedBy=CDK`.
- Prefer low-cost development settings.
- Never delete production-like resources without explicit user approval.

## Task workflow

1. Read `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `ROADMAP.md`, and `CODEX_TASKS.md`.
2. Restate the bounded task and affected files.
3. Implement the smallest complete change.
4. Add or update tests.
5. Run checks.
6. Summarize changes, test results, risks, and the next recommended task.
