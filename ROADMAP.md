# Development Roadmap

## M0 — Repository foundation

- [ ] Install dependencies and verify all root scripts
- [ ] Add shared contracts and validation packages
- [ ] Establish CI

## M1 — Product Catalogue vertical slice

- [ ] Product domain model and validation
- [ ] DynamoDB repository
- [ ] Lambda API handlers
- [ ] OpenAPI routes
- [ ] Unit and API tests
- [ ] CDK table, Lambda and API Gateway resources

## M2 — Order Processing container

- [ ] Express service and health endpoint
- [ ] Order domain and state machine
- [ ] Dockerfile and local container test
- [ ] DynamoDB order repository
- [ ] EventBridge publisher
- [ ] ECR, ECS Fargate and ALB CDK resources

## M3 — Inventory event processing

- [ ] Inventory table and API query endpoint
- [ ] SQS queue and DLQ
- [ ] Inventory reservation Lambda
- [ ] Idempotency handling
- [ ] Inventory outcome events

## M4 — Notification service

- [ ] Notification queue and DLQ
- [ ] Lambda consumer
- [ ] SNS email topic
- [ ] Failure tests

## M5 — Authentication and authorization

- [ ] Cognito user pool and app client
- [ ] JWT authorizer
- [ ] RBAC groups
- [ ] Route-level permissions
- [ ] Frontend sign-in flow

## M6 — Frontend

- [ ] Product catalogue UI
- [ ] Order placement and status UI
- [ ] Inventory manager UI
- [ ] Administrator UI
- [ ] S3/CloudFront or Amplify hosting

## M7 — Observability and resilience

- [ ] Structured logging and correlation IDs
- [ ] CloudWatch dashboard and alarms
- [ ] X-Ray tracing
- [ ] Retry/DLQ demonstrations
- [ ] ECS task recovery demonstration

## M8 — Testing and performance

- [ ] Integration suite
- [ ] End-to-end order workflow
- [ ] Postman/Newman collection
- [ ] k6 baseline, load, stress and spike tests
- [ ] Results and limitations analysis

## M9 — Disaster recovery and final evidence

- [ ] Secondary-region CDK configuration
- [ ] Replication/failover design
- [ ] RTO and RPO definition
- [ ] Recovery test or controlled simulation
- [ ] Screenshots, logs, test reports and deployment instructions
