# SmartRetailX

SmartRetailX is a TypeScript monorepo for an event-driven retail application on AWS. It includes a
React frontend, independently deployable backend services, shared API and event contracts, Docker
support for the Order service, AWS CDK infrastructure, and automated tests.

## Source package contents

| Requirement               | Location                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Microservices source code | `domains/auth/service`, `domains/catalogue/service`, `domains/inventory/service`, `domains/order/service` |
| Frontend source code      | `apps/web`                                                                                                |
| API definitions           | `openapi/smartretailx-api.yaml`, `core/api-contracts`                                                     |
| Event definitions         | `core/event-contracts`                                                                                    |
| Docker files              | `domains/order/service/Dockerfile`, `domains/order/service/.dockerignore`                                 |
| Deployment configuration  | `infrastructure` (AWS CDK v2 / CloudFormation)                                                            |
| Testing scripts           | Workspace tests and `tests/postman`, `tests/performance`, `tests/end-to-end`, `tests/integration`         |
| Documentation             | This file, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `SECURITY.md`, `TEST_STRATEGY.md`, and `docs`              |

Kubernetes is not used in this implementation. AWS CDK synthesizes the deployment configuration to
CloudFormation.

## Architecture summary

- Product Catalogue: API Gateway HTTP API, Lambda, DynamoDB, and S3.
- Order Processing: Express on ECS Fargate behind an internal Application Load Balancer and API
  Gateway VPC Link.
- Inventory Management: SQS-triggered Lambda with DynamoDB-backed atomic reservations and
  idempotency.
- Authentication: Amazon Cognito authorization code flow with PKCE, API Gateway JWT authorization,
  and application-level role and ownership checks.
- Event workflow: DynamoDB Streams, EventBridge, SQS queues, and dead-letter queues coordinate the
  Order and Inventory services.
- Frontend: React and Vite, with S3 and CloudFront infrastructure.
- Observability: structured logs, CloudWatch dashboards and alarms, X-Ray, and OpenTelemetry for the
  Order container.

See `ARCHITECTURE.md` for the event flow, ownership boundaries, security controls, and resilience
design.

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- Docker Desktop for container validation
- AWS CLI v2 and AWS CDK v2 for infrastructure review
- Newman for Postman execution and k6 for performance tests, when required

## Install and verify

From the repository root:

```powershell
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
```

## Local configuration

Copy the example files and replace every placeholder with values for your own environment:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Do not commit `.env`, `.env.local`, access tokens, credentials, private keys, or generated deployment
outputs.

Start the frontend:

```powershell
npm --workspace @smartretailx/web run dev
```

The Order service requires a Cognito User Pool issuer and client ID. Its production composition also
requires an Orders table and AWS credentials supplied through the normal AWS credential provider
chain. Refer to `domains/order/service/README.md` for service-specific details.

## Docker

Build the Order service container from the repository root:

```powershell
docker build --file domains/order/service/Dockerfile --tag smartretailx-order:local .
```

The image exposes port `3000` and defines a `/health` container health check. Runtime resource names
and Cognito configuration are injected by CDK; no credentials are embedded in the image.

## API and test assets

- OpenAPI 3.0 contract: `openapi/smartretailx-api.yaml`
- Postman collection: `tests/postman/SmartRetailX.postman_collection.json`
- Postman environment template: `tests/postman/template.postman_environment.json`
- k6 scenarios and instructions: `tests/performance`

Run the Postman collection after supplying a reviewed environment:

```powershell
npx newman run tests/postman/SmartRetailX.postman_collection.json --environment tests/postman/template.postman_environment.json
```

Performance tests generate live traffic and require explicit endpoint configuration. Follow
`tests/performance/README.md` before running them.

## Infrastructure review

Infrastructure is defined in TypeScript under `infrastructure` and synthesized by AWS CDK v2:

```powershell
npm run cdk:synth
npm run cdk:diff
```

Before any deployment, confirm the AWS account and region with `aws sts get-caller-identity`, review
the cost implications and `cdk diff`, and provide an immutable Order image tag. Do not deploy by
using the local placeholder image tag. Detailed instructions and limitations are in `DEPLOYMENT.md`
and `infrastructure/README.md`.

## Security

The repository contains example configuration only. It must not contain long-lived credentials,
tokens, secrets, private keys, real `.env` files, or unreviewed CloudFormation outputs. See
`SECURITY.md` for the implemented security model and remaining production-hardening work.
