# Final Regression Summary

This folder contains a comprehensive breakdown of the system state for the SmartRetailX Codex assessment.

## Test Results

- **Automated local tests**: PASS — 589 tests across 53 Jest/Vitest suites and files.
- **Integration/E2E evidence (`02-integration-tests`, `03-postman`)**: INVALID — RERUN REQUIRED. Five Newman requests failed with `ENOTFOUND`; those failures do not demonstrate a working live endpoint.
- **Performance evidence (`09-performance-k6`)**: INVALID — RERUN REQUIRED. The recorded k6 requests failed during DNS resolution or connection setup, so no latency, throughput, or error-rate conclusion can be drawn.

## Observability & Resilience

- **Observability (`10-observability`)**: The CloudWatch system dashboard captures Lambda errors, SQS backlogs, and ECS utilization. The checked six-hour X-Ray window contained no traces.
- **Resilience (`08-resilience-dr`)**:
  - The live Orders table currently has point-in-time recovery disabled. Enabling it requires a separately reviewed CDK change and cost approval.
  - The OrderService VPC spans two Availability Zones, but the ECS service currently has a desired count of one. This is not evidence of multi-task high availability.

## Security

- **Security (`11-security`)**:
  - `npm audit` currently reports one high-severity transitive finding in `brace-expansion` through `aws-cdk-lib`; no forced dependency update was applied.
  - IAM least-privilege roles are defined across the CDK stacks.
- **Auth/RBAC (`04-auth-rbac`)**: AWS Cognito User Pools use Authorization Code with PKCE, with JWT validation at the application boundary.

## Architecture

- **Event Processing (`07-event-processing`)**: Event-driven choreography is managed through AWS EventBridge and SQS queues.
- **Infrastructure (`12-cdk-infrastructure`)**: Infrastructure is defined with AWS CDK v2 and deployed through CloudFormation.
