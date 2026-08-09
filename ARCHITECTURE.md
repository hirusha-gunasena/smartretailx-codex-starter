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
  -> [Task 011 CDK; not deployed] OrderCreated rule
  -> [Task 011 CDK; not deployed] Inventory SQS queue and DLQ
  -> [Task 011 CDK; not deployed] Inventory Lambda
  -> [Task 011 CDK; not deployed] DynamoDB Inventory + Inventory Reservations tables
  -> [Task 013 infrastructure pending] Inventory Reservations DynamoDB Stream
  -> [Task 012 code; Task 013 Lambda resource pending] Inventory Outcome Relay
  -> Existing SmartRetailX EventBridge bus: InventoryReserved | InventoryRejected
       +--> [future] Order workflow consumer
       +--> [future] Notification consumer
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
order event bus. Task 011 reuses that bus by passing its construct to a separate Inventory stack; it
does not create or look up another bus.

Task 009 defines this infrastructure in CDK only. It has not been deployed.

Task 010 adds the Inventory consumer application and DynamoDB adapter code only. The consumer
validates the EventBridge wrapper and nested canonical `OrderCreated` event, aggregates duplicate
product lines, and uses one DynamoDB transaction for all stock updates plus the durable reservation
outcome. The canonical event ID is both the reservation key and stable transaction token, so
at-least-once SQS delivery does not decrement stock twice. Expected stock condition failures become
durable `REJECTED / INSUFFICIENT_STOCK` outcomes without partial stock changes; transaction
conflicts, throttling, and unexpected AWS failures remain retryable.

The consumer returns failed SQS message IDs through `batchItemFailures` and continues processing the
rest of the batch. Task 011 configures `ReportBatchItemFailures` on the SQS event source mapping, so
malformed messages and transient DynamoDB failures retry independently. Durable insufficient-stock
rejections and duplicate deliveries remain successful SQS processing. Inventory outcomes are
deliberately not published directly after the transaction, avoiding a database/event-bus dual
write.

Task 011 defines the precise OrderCreated rule, full-envelope SQS target, encrypted source queue and
terminal DLQ, Inventory Lambda, both Inventory tables, event source mapping, and least-privilege IAM.
The Lambda stays outside a VPC because SQS, DynamoDB, and CloudWatch are regional AWS service
endpoints and no private resource requires VPC connectivity. The Reservations table has no stream;
that stream and the Inventory outcome relay infrastructure remain deferred to Task 013. None of
this infrastructure has been deployed.

Task 012 adds the Inventory outcome relay application and adapter code only. A future Reservations
stream `INSERT` is unmarshalled and validated as the durable `InventoryReservation` source of truth,
then maps `RESERVED` to canonical `InventoryReserved` and `REJECTED` to canonical
`InventoryRejected`. The mapping preserves the workflow correlation ID, uses durable `processedAt`
as `occurredAt`, and derives a deterministic UUID v5 from outcome type and reservation identity.
This supports at-least-once stream retries; future Order and Notification consumers must also be
idempotent by canonical event ID.

The relay publishes to the existing custom bus with routing source
`smartretailx.inventory-service` and returns failed stream sequence numbers through
`batchItemFailures`. It ignores `MODIFY` and `REMOVE` in code. Task 013 must enable the Reservations
stream, create the relay Lambda and permissions, and configure its event source mapping with
`ReportBatchItemFailures`. Task 012 does not create or deploy any AWS resource.

## Data ownership

| Service          | Primary store                        | Ownership                  |
| ---------------- | ------------------------------------ | -------------------------- |
| Catalogue        | DynamoDB Products, S3 product assets | Product records and assets |
| Order            | DynamoDB Orders                      | Order lifecycle            |
| Inventory        | DynamoDB Inventory and Reservations  | Stock and durable outcomes |
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
