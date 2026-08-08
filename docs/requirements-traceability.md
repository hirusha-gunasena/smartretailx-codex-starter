# Requirements Traceability

| Requirement | Planned implementation | Evidence |
|---|---|---|
| Three or more microservices | Catalogue, Order, Inventory, Notification | Source folders, deployed endpoints, diagrams |
| Synchronous APIs | API Gateway and ALB REST routes | OpenAPI, Postman results |
| Asynchronous processing | EventBridge + SQS + Lambda | Events, queue metrics, logs |
| Containerization | Order service on ECS Fargate | Dockerfile, ECR image, ECS tasks |
| Authentication and RBAC | Cognito, JWT authorizer, groups | 401/403 tests, Cognito screenshots |
| High availability | Multi-AZ ALB and ECS tasks | Target health and AZ evidence |
| Resilience | Retry, DLQ, idempotency, health checks | Failure test results |
| Observability | CloudWatch and X-Ray | Dashboard, alarms, trace screenshots |
| Performance | k6 load/stress/spike tests | Results and charts |
| Disaster recovery | Secondary-region design/stack | RTO/RPO and failover test |
| Infrastructure as code | TypeScript CDK -> CloudFormation | CDK source and synthesized templates |
