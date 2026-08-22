# SmartRetailX Source Package Manifest

## Application source

- `apps/web` - React and Vite frontend
- `domains/auth/service` - Cognito administration Lambda source
- `domains/catalogue/service` - Product Catalogue Lambda source
- `domains/inventory/service` - Inventory API, SQS consumer, and outcome relay source
- `domains/order/service` - Express Order API and Order workflow Lambda source
- `core/api-contracts` - shared API schemas and types
- `core/event-contracts` - versioned event envelopes and schemas

## Interfaces and deployment

- `openapi/smartretailx-api.yaml` - OpenAPI 3.0 definition
- `domains/order/service/Dockerfile` - Order service container definition
- `domains/order/service/.dockerignore` - container build exclusions
- `infrastructure` - AWS CDK v2 application, stacks, tests, and configuration

Kubernetes manifests are not included because this implementation deploys with AWS CDK and
CloudFormation to Lambda and ECS Fargate.

## Testing

- Unit and HTTP tests colocated with each workspace
- `tests/postman` - Postman collection, Newman instructions, and environment template
- `tests/performance` - k6 baseline, load, stress, and spike scenarios
- `tests/integration` and `tests/end-to-end` - integration and workflow test assets
- `TEST_STRATEGY.md` - test approach and commands

## Documentation and configuration

- `README.md` - setup, verification, Docker, API, and infrastructure instructions
- `ARCHITECTURE.md` - architecture and event-flow design
- `DEPLOYMENT.md` - deployment gates and procedures
- `SECURITY.md` - security controls and limitations
- `COST_GUARDRAILS.md` - cost controls
- `PROJECT_SPEC.md` - project scope
- `docs` - ADRs, traceability, and runbooks
- `.env.example` and `apps/web/.env.example` - placeholder-only environment schemas
- `package.json` and `package-lock.json` - reproducible npm workspace dependencies
