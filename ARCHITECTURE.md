# SmartRetailX Architecture

## Primary request path
```text
Browser -> Route 53 -> CloudFront/WAF -> React frontend
Browser -> Cognito -> JWT
Frontend -> API Gateway -> Lambda services
Frontend/API Gateway -> ALB -> ECS Fargate Order service
```

## Event-driven order flow
```text
Order Service
  -> EventBridge: OrderCreated
  -> SQS order-events queue
  -> Inventory Lambda
  -> DynamoDB inventory update
  -> EventBridge: InventoryReserved | InventoryRejected
  -> SQS order-status queue and notification queue
  -> Order status update + Notification Lambda -> SNS email
```

## Data ownership
| Service | Primary store | Ownership |
|---|---|---|
| Catalogue | DynamoDB Products, S3 product assets | Product records and assets |
| Order | DynamoDB Orders | Order lifecycle |
| Inventory | DynamoDB Inventory | Stock and reservations |
| Notification | DynamoDB Notifications or logs | Notification state |
| Shared technical | DynamoDB ProcessedEvents | Idempotency only |

## Network
- One VPC in the primary region spanning two Availability Zones.
- Public subnets: ALB and NAT gateways.
- Private subnets: ECS tasks and any VPC-connected workloads.
- Lambda remains outside the VPC unless it needs private resources; DynamoDB/S3/EventBridge access does not require VPC placement.
- Security groups allow ALB-to-ECS traffic only on the application port.

## Resilience
- ECS desired count of at least two tasks across AZs for the final demonstration.
- SQS DLQs and bounded retries.
- DynamoDB point-in-time recovery in the final environment.
- S3 versioning and optional cross-region replication.
- DynamoDB Global Tables considered for secondary-region recovery.
- Route 53 health-check failover in the DR design.

## Security
- Cognito User Pool and app client.
- API Gateway JWT authorizer.
- Cognito groups: `Customers`, `InventoryManagers`, `Administrators`.
- IAM roles for Lambda and ECS tasks.
- KMS encryption and Secrets Manager for non-public secrets.
- CloudFront/WAF and ACM TLS for public endpoints.

## Observability
- Structured JSON logs in CloudWatch Logs.
- CloudWatch metrics and dashboards for API Gateway, Lambda, ECS, SQS and DynamoDB.
- Alarms for API errors, Lambda errors, ECS resource pressure, queue age and DLQ depth.
- Correlation IDs across synchronous requests and events.
- X-Ray or compatible distributed tracing where supported.
