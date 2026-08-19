# Final Regression Summary

This folder contains a comprehensive breakdown of the system state for the SmartRetailX codex assessment.

## Test Results

- **Unit Tests (`01-unit-tests`)**: Executed via Jest across all domain packages.
- **Integration/E2E Tests (`02-integration-tests`, `03-postman`)**: Defined via Postman collections testing the Catalogue, Inventory, and Order domains.
- **Performance Tests (`09-performance-k6`)**: Baseline, Stress, Spike, and Normal load models defined via k6.

## Observability & Resilience

- **Observability (`10-observability`)**: CloudWatch System Dashboard capturing Lambda Errors, SQS Backlogs, and ECS utilization.
- **Resilience (`08-resilience-dr`)**: 
  - DynamoDB Tables configured with `PointInTimeRecovery` (PITR).
  - ECS Fargate services deployed across multiple AZs.

## Security

- **Security (`11-security`)**:
  - Validated via `npm audit`.
  - IAM least-privilege roles defined across all CDK stacks.
- **Auth/RBAC (`04-auth-rbac`)**: AWS Cognito User Pools configured for implicit flow with JWT validation at the API Gateway.

## Architecture

- **Event Processing (`07-event-processing`)**: Event-driven choreography managed via AWS EventBridge and SQS queues.
- **Infrastructure (`12-cdk-infrastructure`)**: Fully automated IaC deployment via AWS CDK v2.
