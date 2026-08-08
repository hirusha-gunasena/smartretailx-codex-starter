# Bounded Codex Tasks

Use one task per Codex session or pull request.

## Task 001 — Foundation
Create the root npm workspace configuration, shared TypeScript settings, ESLint, Prettier and CI. Do not implement business services. Run format, lint, typecheck and tests.

## Task 002 — Shared event contracts
Implement typed, versioned event envelopes in `packages/contracts`, including schemas for `OrderCreated`, `InventoryReserved`, and `InventoryRejected`. Add Zod validation and unit tests.

## Task 003 — Catalogue domain
Implement product entities, validation and domain errors inside `services/catalogue-service`. Do not add AWS infrastructure yet.

## Task 004 — Catalogue persistence and API
Add DynamoDB repository code using AWS SDK v3, API Gateway HTTP API handlers, consistent responses, and tests using mocked AWS clients.

## Task 005 — Catalogue CDK
Create the Products table, Lambda function, least-privilege role and HTTP API routes. Run CDK assertions and synth. Do not deploy.

## Task 006 — Order service local implementation
Build an Express TypeScript service with `/health`, order creation and retrieval. Add Dockerfile, unit tests and Supertest tests. Do not add AWS resources.

## Task 007 — Order event publishing
Add EventBridge publishing through an interface and adapter, correlation IDs and event contract tests.

## Task 008 — ECS infrastructure
Create ECR, ECS cluster, Fargate task definition/service, ALB, target group, security groups and CloudWatch logs. Run CDK assertions and synth. Do not deploy.

## Task 009 — Inventory consumer
Implement an SQS Lambda consumer that reserves stock with conditional DynamoDB updates, records processed event IDs, and emits an outcome event. Add duplicate-delivery tests.

## Task 010 — Notification consumer
Implement SQS-to-Lambda-to-SNS notification flow with a DLQ and tests.

## Task 011 — Cognito and RBAC
Create Cognito, JWT authorizer and group definitions. Protect routes according to the role matrix in `PROJECT_SPEC.md`.

## Task 012 — Frontend MVP
Create React pages for sign-in, products, order placement, order status, inventory management and admin product management.

## Task 013 — Observability
Add structured logging, correlation propagation, dashboards, alarms and tracing configuration.

## Task 014 — Test automation
Add end-to-end scripts, Postman/Newman collection and k6 performance tests.

## Task 015 — DR configuration
Add optional secondary-region stacks and deployment documentation. Do not deploy without explicit approval.
