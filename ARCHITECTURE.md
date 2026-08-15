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

## Task018 identity and Catalogue authorization

Task018 adds a dedicated `SmartRetailX-dev-Auth` stack. It owns one email-based Cognito User Pool,
the `customer` and `admin` application groups, one public SPA client and one Cognito-owned domain.
The public client uses Authorization Code Grant with PKCE and does not have a client secret. Its
issuer and client ID are passed to `CatalogueStack` as CDK cross-stack references; account IDs,
regions and ARNs are not hardcoded.

```text
Browser -> Cognito hosted authorization endpoint -> authorization code + PKCE
Browser -> Cognito token endpoint -> access token
Browser -> Catalogue HTTP API -> Cognito JWT authorizer -> Catalogue Lambda RBAC -> use case
```

All five `/api/v1/products` routes share one HTTP API JWT authorizer. API Gateway verifies the
Cognito issuer, app-client audience and `openid` route scope. Lambda trusts only the resulting
authorizer claim context and performs the application-role decision before product parsing or data
access: `customer` and `admin` can use GET routes, while only `admin` can use POST, PATCH and DELETE.
This deliberately separates token verification from business authorization and avoids adding a JWT
library or JWKS fetch path to the Lambda.

Task018 is implemented and synth-tested locally. It has not been deployed and has not created a User
Pool, client, domain, group or user in AWS.

## Task024 secure Order API infrastructure

Task024 adds local CDK definitions for two separately deployable stacks. `OrderRegistryStack` owns
the private ECR repository, while `OrderServiceStack` consumes an explicitly configured immutable
image tag and reuses the existing Cognito issuer/client and `smartretailx-orders-dev` table. The
existing Order lifecycle relay, EventBridge bus, Inventory path and Order Workflow remain owned by
their current stacks.

```text
Browser/client
  -> Order HTTP API
  -> Cognito JWT authorizer
  -> VPC Link
  -> internal Application Load Balancer
  -> Fargate Order Express access-token verification
  -> exact-group RBAC and object ownership
  -> existing Orders DynamoDB table
  -> existing Orders stream / Saga lifecycle
```

The ALB is internal so it is not an alternate public path around API Gateway authentication. A
dedicated security-group chain permits only VPC Link to ALB on port 80 and ALB to tasks on port
3000; the task port has no internet ingress. For the bounded development environment, Fargate tasks
run in two public subnets with public IPs so they can pull from ECR and reach regional AWS public
endpoints without a NAT Gateway. The public IP supplies outbound connectivity only: security-group
ingress remains restricted to the internal ALB. A production design should reassess private
subnets, VPC endpoints/NAT, egress restrictions, availability and cost.

The external API exposes only the three existing Order application routes. Every route requires the
existing Cognito JWT authorizer and `openid` scope; `/health` is reachable only through the internal
load-balancer target group. API Gateway overwrites the private-integration path with
`$request.path`, preventing the `$default` stage name from being forwarded to Express.

Task025 adds the application authorization boundary behind the API JWT authorizer. The container
verifies the original bearer access token with `aws-jwt-verify` against the configured existing User
Pool, public SPA client, `token_use=access`, expiry, signature and `openid` scope. Only an exact
single `customer` or `admin` group is accepted. The application carries only the verified opaque
subject and normalized role; it does not trust identity headers from the client or API integration.

Application identity translation deterministically maps the opaque Cognito subject to the domain's
UUID `customerId` using UUID v5: a DNS-namespaced
`customers.smartretailx.internal` namespace, then `UUIDv5("cognito:" + subject, namespace)`.
Customers can create Orders only for that derived identity, list only their partition through the
single `customerId-createdAt-index` GSI, and retrieve only owned Orders. A non-owner lookup returns
the same not-found response as an absent Order. Admins can list/read all Orders but cannot create a
customer Order. The list API remains unpaginated; repository adapters collect every DynamoDB page.

The GSI belongs to the existing OrderEvents-owned GlobalTable, uses `customerId` / `createdAt` string
keys and `ALL` projection, and does not change the primary key, on-demand billing, stream or replica.
Admin list retains the existing Scan path. The existing DynamoDB Stream remains the sole lifecycle
publication path; the Order API still has no direct EventBridge permission. Task025 is local-only:
the GSI, Task024 stacks and Order image have not been deployed or pushed.

```text
Customer list: verified subject -> UUID v5 customerId -> customerId-createdAt-index -> Query
Admin list:    verified admin role -> Orders base table -> Scan
Create:        derived customerId -> PutItem PENDING -> DynamoDB Stream -> lifecycle relay -> EventBridge
```

The authentication/application design is container-platform neutral. A future EKS deployment can
reuse the same bearer-token, Cognito verifier, RBAC, ownership and DynamoDB logic while changing
only the infrastructure workload-IAM mechanism; the code does not depend on ECS metadata,
cluster/service identity, ECS Exec, instance identity or ALB authentication headers. Task025 adds
no Kubernetes or EKS resources.

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

- Dedicated Cognito User Pool and public authorization-code/PKCE app client.
- API Gateway JWT authorizer on every Catalogue route.
- Cognito application groups: `customer` (Catalogue read) and `admin` (Catalogue read/write), with
  no IAM roles attached.
- Fail-closed Lambda authorization using only API Gateway-validated access-token claims.
- IAM roles for Lambda and ECS tasks.
- KMS encryption and Secrets Manager for non-public secrets.
- CloudFront/WAF and ACM TLS for public endpoints.

## Observability

- Structured JSON logs in CloudWatch Logs.
- CloudWatch metrics and dashboards for API Gateway, Lambda, ECS, SQS and DynamoDB.
- Alarms for API errors, Lambda errors, ECS resource pressure, queue age and DLQ depth.
- Correlation IDs across synchronous requests and events.
- X-Ray or compatible distributed tracing where supported.
