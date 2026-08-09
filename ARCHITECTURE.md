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
POST Order -> Orders DynamoDB: PENDING
  -> Orders stream INSERT
  -> Unified Order Lifecycle Relay
  -> EventBridge: OrderCreated
  -> [Task 011 CDK; not deployed] Inventory queue, consumer, and tables
  -> [Task 012 code + Task 013 CDK; not deployed] Inventory Outcome Relay
  -> EventBridge: InventoryReserved | InventoryRejected
  -> [Task 014 code + Task 015 CDK; not deployed] Order Workflow Consumer
  -> Orders DynamoDB: CONFIRMED | REJECTED
  -> Orders stream MODIFY: NEW_AND_OLD_IMAGES
  -> same Unified Order Lifecycle Relay
  -> EventBridge: OrderConfirmed | OrderRejected
  -> [future] Notification consumer
```

The Order API persists only; it does not directly publish to EventBridge because that would create a
dual-write consistency gap. The relay uses DynamoDB Streams change data capture so an accepted order
can be retried independently. Stream delivery is at least once, so lifecycle event IDs are derived
deterministically from event type and order ID, and every downstream consumer must be idempotent.
The unified relay preserves `INSERT PENDING -> OrderCreated` and recognizes only
`PENDING -> CONFIRMED` or `PENDING -> REJECTED` transitions for terminal publication. Valid
state-preserving modifications and removals are ignored; terminal flips, rollbacks, malformed
images, immutable-data mutations, and timestamp regressions fail their individual stream records.

The Task 009 CDK definition enables `ReportBatchItemFailures` so successfully processed stream
records are not retried with failed ones. It starts at
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
endpoints and no private resource requires VPC connectivity. The Task 011 Reservations table
definition had no stream; Task 013 changes it to add a `NEW_IMAGE` stream and the Inventory outcome
relay. None of this infrastructure has been deployed.

Task 012 adds the Inventory outcome relay application and adapter code only. A future runtime
Reservations stream `INSERT` is unmarshalled and validated as the durable `InventoryReservation`
source of truth, then maps `RESERVED` to canonical `InventoryReserved` and `REJECTED` to canonical
`InventoryRejected`. The mapping preserves the workflow correlation ID, uses durable `processedAt`
as `occurredAt`, and derives a deterministic UUID v5 from outcome type and reservation identity.
This supports at-least-once stream retries; future Order and Notification consumers must also be
idempotent by canonical event ID.

The relay publishes to the existing custom bus with routing source
`smartretailx.inventory-service` and returns failed stream sequence numbers through
`batchItemFailures`. It ignores `MODIFY` and `REMOVE` in code.

Task 013 defines the Reservations `NEW_IMAGE` stream, Node.js 22 relay Lambda, seven-day log group,
and a `TRIM_HORIZON` event source mapping with batches of 10, `ReportBatchItemFailures`, three
retries, batch bisection, and a one-hour maximum record age. Exhausted or expired records go to a
dedicated SQS failure destination with a terminal DLQ. That destination contains Lambda invocation
and failure metadata, not the complete original DynamoDB stream payload; S3 is the alternative when
complete original invocation retention is required.

The relay remains outside a VPC and reuses the existing cross-stack EventBridge bus. Its role can
read only the Reservations stream, put events only on that bus, and send only to its failure
destination. It has no Inventory table mutation permission. Future Order workflow and Notification
consumers remain deferred, and Task 013 has not been deployed.

Task 014 adds the Order workflow consumer application and adapter code only. It is the Order-side
state-transition participant in the choreography-based Saga:

```text
OrderCreated
  -> Inventory reservation
  -> InventoryReserved | InventoryRejected
  -> Order Workflow Consumer
  -> CONFIRMED | REJECTED
```

Immediately after `POST /api/v1/orders`, the durable Order is `PENDING`. After asynchronous
inventory processing and outcome delivery, it eventually becomes `CONFIRMED` or `REJECTED`.
`InventoryReserved` requests `CONFIRMED`; `InventoryRejected` requests `REJECTED`. One conditional
DynamoDB update requires an existing `PENDING` Order and sets deterministic `updatedAt` from
canonical `occurredAt` together with `reservationId` for `CONFIRMED` or `rejectionReason` for
`REJECTED`. Matching duplicates require both the same status and the same durable outcome metadata;
they are acknowledged without a rewrite. Different metadata or an opposite terminal state is a
typed conflict that cannot flip the Order and requires operational investigation.

No distributed ACID transaction spans the Order and Inventory services: each owns and commits its
state independently, and EventBridge/SQS communication is asynchronous. At-least-once duplicates
are tolerated, conditional writes enforce state-machine correctness, transient failures remain
retryable, and irreconcilable Saga outcomes follow operational failure handling. Payment and
compensation are not implemented, and this is not a centralized Saga orchestrator.

Task 014 does not directly publish `OrderConfirmed` or `OrderRejected`; the Orders record remains
the durable source of truth, avoiding another database/event-bus dual write. The unified Orders
Stream relay produces those terminal events from validated `MODIFY` transitions. Task 015 defines the
EventBridge rule, Order Workflow SQS queue and DLQ, Lambda, least-privilege IAM, and event source
mapping with `ReportBatchItemFailures`; those definitions are described below and remain
undeployed.

Task 015 defines that Order workflow infrastructure in CDK without deploying it. `OrderEventsStack`
continues to own the single Orders table and custom EventBridge bus; the dedicated
`OrderWorkflowStack` consumes both through strong cross-stack references. One rule on that existing
bus matches only source `smartretailx.inventory-service` and detail types `InventoryReserved` and
`InventoryRejected`, then passes the complete EventBridge envelope to the Standard Order Workflow
SQS queue without transformation.

The source queue uses SQS-managed encryption, four-day retention, a 120-second visibility timeout,
and redrive after five receives to a terminal 14-day DLQ. That DLQ handles messages that EventBridge
successfully placed on SQS but the application repeatedly failed to process; it is not an
EventBridge target-delivery failure queue. The SQS event source mapping processes batches of 10 with
no added batching delay and enables `ReportBatchItemFailures`, preserving Task 014's per-message
retry behavior under at-least-once delivery.

The Node.js 22 workflow Lambda has 256 MB memory, a 15-second timeout, seven-day logs, and only the
existing Orders table name in its application environment. Its table-scoped application IAM allows
only `GetItem` and `UpdateItem`; the SQS integration adds source-queue consumer operations without
`SendMessage` or terminal-DLQ access. The Lambda remains outside a VPC because SQS, DynamoDB,
EventBridge, and CloudWatch are regional service endpoints and no private resource is required.
It has no EventBridge publication permission; terminal publication remains the separate unified
Orders CDC relay's responsibility. No Task 015 resource has been deployed.

Task 016A corrects the durable Order shape required by that deferred CDC relay:

```text
PENDING   -> no terminal outcome metadata
CONFIRMED -> reservationId
REJECTED  -> rejectionReason
```

The Task 014 consumer already receives these values in canonical Inventory outcomes. It now stores
the appropriate value atomically with the terminal status and deterministic timestamp, removes the
incompatible metadata field, and treats a same-status delivery with different metadata as a Saga
conflict rather than a duplicate. This lets the future unified Orders Stream relay construct the
existing canonical `OrderConfirmed` and `OrderRejected` events from durable stream images without
querying another service or fabricating business data. Task 016A added no publisher, stream mapping,
CDK resource, or deployment; Task 016 now consumes that durable metadata through CDC.

Task 016 extends the existing Task 008 mapper, publisher, batch handler, composition, and Lambda
entry path into one unified Order lifecycle relay. It does not introduce another Orders stream
consumer. `OrderCreated` retains its original deterministic identity and envelope behavior.
`OrderConfirmed` takes the exact `reservationId` from the durable `CONFIRMED` new image, while
`OrderRejected` takes the exact durable `rejectionReason`; both use the new image's `updatedAt` as
`occurredAt` and the Order ID as `correlationId`. All three event types publish through one reused
EventBridge client and the existing bus configuration.

The eventual lifecycle is deliberately staged: the POST commits `PENDING`; the asynchronous
Inventory outcome commits a terminal Order state; then Orders CDC emits the terminal lifecycle
event. Task 014 still performs no EventBridge publication. Task 016 is application/adapter code only.

Task 017 changes the single existing Orders stream from `NEW_IMAGE` to `NEW_AND_OLD_IMAGES` so
`INSERT` continues to supply `NewImage` and `MODIFY` supplies the `OldImage`/`NewImage` pair required
for transition detection. It preserves one Orders table, one unified relay Lambda, one event-source
mapping, the existing EventBridge bus, scoped IAM, bounded retries, failure destination, and
`ReportBatchItemFailures`. No Task 016 or Task 017 infrastructure has been deployed.

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
