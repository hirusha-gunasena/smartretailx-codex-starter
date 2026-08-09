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
  -> DynamoDB Orders table
  -> DynamoDB Stream INSERT records
  -> Order Event Relay Lambda
  -> EventBridge: OrderCreated
  -> SQS order-events queue
  -> Inventory Lambda
  -> DynamoDB inventory update
  -> EventBridge: InventoryReserved | InventoryRejected
  -> SQS order-status queue and notification queue
  -> Order status update + Notification Lambda -> SNS email
```

The Order API persists only; it does not directly publish to EventBridge because that would create a
dual-write consistency gap. The relay uses DynamoDB Streams change data capture so an accepted order
can be retried independently. Stream delivery is at least once, so `OrderCreated` IDs are derived
deterministically from event type and order ID, and every downstream consumer must be idempotent.
Only `INSERT` records create events. The Task 009 CDK definition enables `ReportBatchItemFailures`
so successfully processed stream records are not retried with failed ones. It starts at
`TRIM_HORIZON`, processes batches of 10 without an added batching delay, bisects failed batches,
limits retries to three, and sends exhausted or over-age records to a dedicated encrypted failure
queue. Records older than one hour are sent to that failure path rather than retried indefinitely.

The relay Lambda is not placed in a VPC: DynamoDB Streams, EventBridge, SQS, and CloudWatch are AWS
service endpoints, so a VPC and NAT Gateway would add cost without serving a requirement here. Its
application IAM permits only read access to the Orders stream and `events:PutEvents` on the custom
order event bus. The Inventory queue and EventBridge routing rules are deliberately deferred.

Task 009 defines this infrastructure in CDK only. It has not been deployed.

## Data ownership

| Service          | Primary store                        | Ownership                  |
| ---------------- | ------------------------------------ | -------------------------- |
| Catalogue        | DynamoDB Products, S3 product assets | Product records and assets |
| Order            | DynamoDB Orders                      | Order lifecycle            |
| Inventory        | DynamoDB Inventory                   | Stock and reservations     |
| Notification     | DynamoDB Notifications or logs       | Notification state         |
| Shared technical | DynamoDB ProcessedEvents             | Idempotency only           |

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
