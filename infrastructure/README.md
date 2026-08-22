# SmartRetailX infrastructure

The CDK application keeps bounded workloads in separate stacks. `FoundationStack` remains the
repository scaffold, `CatalogueStack` defines the Product Catalogue API, and `OrderEventsStack`
defines the unified Order lifecycle relay infrastructure. `InventoryStack` reuses the Order event
bus and defines the asynchronous Inventory consumer path. `OrderWorkflowStack` reuses that bus and
the existing Orders table for the Order-side inventory-outcome Saga transition.

## CatalogueStack

For the `dev` environment, the stack synthesizes:

- one API Gateway HTTP API with a single Lambda proxy integration using payload format 2.0;
- one Node.js 22 Catalogue Lambda bundled from
  `domains/catalogue/service/src/handler.ts` with its workspace and AWS SDK dependencies;
- one DynamoDB Products table; and
- the Lambda execution role, a seven-day CloudWatch log group, integration permissions, and
  CloudFormation outputs.

The Lambda is deliberately not placed in a VPC. The HTTP API and DynamoDB service endpoints do not
require private networking for this baseline, and avoiding a VPC also avoids unnecessary networking
complexity and NAT Gateway cost. Private networking is a later architecture decision if a concrete
requirement emerges.

The development Products table uses `productId` as its string partition key, on-demand billing, the
Standard table class, DynamoDB-owned encryption, disabled point-in-time recovery, no indexes, and no
stream. Deletion protection is disabled and the table uses a `DESTROY` removal policy for the bounded
development environment.

The Lambda receives only `PRODUCTS_TABLE_NAME`. Its application policy is scoped to the Products
table and permits only `GetItem`, `Scan`, `PutItem`, `UpdateItem`, and `DeleteItem`; the standard
Lambda logging policy supplies CloudWatch Logs access.

The HTTP API allows the development origin `http://localhost:5173`, the `Content-Type` and
`Authorization` headers, and these routes:

| Method | Route                          |
| ------ | ------------------------------ |
| GET    | `/api/v1/products`             |
| POST   | `/api/v1/products`             |
| GET    | `/api/v1/products/{productId}` |
| PATCH  | `/api/v1/products/{productId}` |
| DELETE | `/api/v1/products/{productId}` |

## OrderEventsStack

For the `dev` environment, this stack synthesizes:

- the `smartretailx-orders-dev` DynamoDB table with `orderId` as its string partition key,
  on-demand billing, Standard table class, default DynamoDB-owned encryption, point-in-time
  recovery, and one customer access GSI;
- a `NEW_AND_OLD_IMAGES` DynamoDB Stream, which supplies `NewImage` for inserted Orders and both
  `OldImage` and `NewImage` for lifecycle modifications;
- the Node.js 22 `smartretailx-order-event-relay-dev` Lambda bundled from
  `domains/order/service/src/order-event-relay.ts` with its application and AWS SDK dependencies;
- the custom `smartretailx-order-events-dev` EventBridge bus, with no rules or cross-account policy;
- a seven-day relay log group; and
- an SQS-managed encrypted relay-failure queue retained for 14 days, plus the repository-required
  dead-letter queue for that destination.

The stream event source mapping starts at `TRIM_HORIZON` to avoid missing records when the mapping
is first established. It uses batches of 10, zero additional batching delay,
`ReportBatchItemFailures`, three retries, batch bisection, and a one-hour maximum record age.
Exhausted or expired records are preserved in the failure destination for debugging. That queue is
not the future Inventory queue.

One Orders stream, relay Lambda, and event-source mapping deliberately handle the complete
lifecycle:

```text
Orders DynamoDB
       |
       | NEW_AND_OLD_IMAGES
       v
Unified Order Lifecycle Relay
       |
       +--> OrderCreated
       +--> OrderConfirmed
       +--> OrderRejected
```

An `INSERT` uses `NewImage` for `OrderCreated`. A `MODIFY` uses both validated images to recognize
only `PENDING -> CONFIRMED` or `PENDING -> REJECTED`; transition-based detection prevents unrelated
state-preserving writes from duplicating terminal events. Task 016 already implements this behavior,
and `ReportBatchItemFailures` remains enabled for record-level retries.

The relay receives only `ORDER_EVENT_BUS_NAME`; it reads each order from the stream and does not need
table data-plane permissions or `ORDERS_TABLE_NAME`. Its application IAM is limited to
`DescribeStream`, `GetRecords`, `GetShardIterator`, and `ListStreams` on the Orders stream,
`events:PutEvents` on the custom bus, and `sqs:SendMessage` on its failure destination. It has no
`PutItem`, `UpdateItem`, `DeleteItem`, `Scan`, or `Query` permission.

The Lambda is deliberately outside a VPC. DynamoDB Streams, EventBridge, SQS, and CloudWatch do not
require private application networking for this workload, so no VPC or NAT Gateway is created. The
stack also creates no ECS, ALB, EC2, RDS, CloudFront, customer-managed KMS key, EventBridge rules,
or Inventory consumer resources.

Development data remains intentionally removable: the table, queues, and log group use `DESTROY`
and table deletion protection is disabled. PITR is enabled on the existing Orders table to protect
against accidental data changes, but a production variant must also use `RETAIN`, deletion
protection, longer operational retention, and a reviewed Global Tables/disaster-recovery design.

The Order relay, Inventory consumer, Inventory outcome relay, and Order workflow Lambda emit a
sanitized `saga.success` JSON record only after their stage succeeds. Operators can query a complete
path using `correlationId` without logging customers, items, message bodies, tokens, or credentials.

Safe outputs expose the Orders table name and stream ARN, event bus name and ARN, relay function
name, and relay-failure queue name.

## InventoryStack

For the `dev` environment, this stack synthesizes:

- `smartretailx-inventory-dev`, an on-demand Standard DynamoDB table keyed by string `productId`;
- `smartretailx-inventory-reservations-dev`, an on-demand Standard DynamoDB table keyed by string
  `eventId`, with a `NEW_IMAGE` stream;
- the SQS-managed encrypted `smartretailx-inventory-orders-dev` source queue with four-day
  retention and a 120-second visibility timeout;
- the SQS-managed encrypted `smartretailx-inventory-orders-dlq-dev` terminal DLQ with 14-day
  retention and source-queue redrive after five receives;
- a Node.js 22 Inventory consumer Lambda bundled from
  `domains/inventory/service/src/handler.ts`, with 256 MB memory, a 15-second timeout, and a
  dedicated seven-day log group;
- a Node.js 22 Inventory Outcome Relay Lambda bundled from
  `domains/inventory/service/src/inventory-outcome-relay.ts`, with 256 MB memory, a 10-second
  timeout, and a dedicated seven-day log group;
- the SQS-managed encrypted `smartretailx-inventory-outcome-relay-failures-dev` stream-failure
  destination with 14-day retention and its terminal DLQ;
- one precise EventBridge rule matching source `smartretailx.order-service` and detail type
  `OrderCreated`; and
- the SQS and DynamoDB stream event source mappings, least-privilege policies, queue resource
  policy, and safe outputs.

The CDK application creates `OrderEventsStack` first and passes its public event-bus construct to
`InventoryStack`. This produces a cross-stack reference to the existing
`smartretailx-order-events-dev` bus; the Inventory stack creates no second bus and performs no ARN
lookup. The SQS target uses the default full-event delivery, so the standard EventBridge envelope
and nested canonical event reach the Task 010 parser unchanged. The queue policy permits the
EventBridge service to send only to the Inventory queue and conditions that access on the routing
rule ARN.

The source queue is a Standard queue because SQS delivery remains at least once and the consumer
deduplicates with the canonical `eventId`. Its redrive policy sends repeatedly malformed messages
or exhausted transient failures to the terminal DLQ. A durable `RESERVED`, insufficient-stock
`REJECTED`, or duplicate outcome is successful processing and is not sent to the DLQ. The event
source mapping uses batches of 10, zero batching delay, and `ReportBatchItemFailures` so only failed
SQS message IDs retry.

The Inventory Lambda receives only `INVENTORY_TABLE_NAME` and
`INVENTORY_RESERVATIONS_TABLE_NAME`. Its DynamoDB policy permits `UpdateItem` only on the Inventory
table and `GetItem`/`PutItem` only on the Reservations table. The SQS integration grants queue
consumption on the source queue; the function has no source-queue `SendMessage` or normal
application access to the DLQ. The EventBridge target helper's queue policy grants scoped
`SendMessage`, `GetQueueAttributes`, and `GetQueueUrl` to the EventBridge service, conditioned on
the single rule.

Both tables use DynamoDB-owned encryption, have PITR and deletion protection disabled for dev, and
use `DESTROY`. They have no sort keys or indexes, no additional replicas, and no seed custom
resource exists. Only the Reservations table has a stream; it uses `NEW_IMAGE` because the durable
Reservation record contains the complete validated outcome required by the relay. The stock table
has no stream.

The Inventory Outcome Relay uses change data capture instead of publishing from the stock
reservation transaction, avoiding a DynamoDB/EventBridge dual write. Its mapping starts at
`TRIM_HORIZON`, uses batches of 10 with no added batching delay, enables
`ReportBatchItemFailures`, bisects failed batches, retries three times, and discards records older
than one hour to the dedicated failure destination. Stream delivery is at least once, so Task 012
generates deterministic outcome event IDs and future Order and Notification consumers must remain
idempotent by canonical `eventId`.

The relay receives only `INVENTORY_EVENT_BUS_NAME`, reusing the exact custom bus supplied by
`OrderEventsStack`. Its application IAM is limited to `events:PutEvents` on that bus, stream-read
operations on the Reservations stream, and `sqs:SendMessage` on its own failure destination. It has
no Inventory table data-plane operations and no access to the Inventory business queue. No outcome
EventBridge rules or downstream consumers are created in Task 013.

The SQS stream on-failure destination stores Lambda invocation and failure metadata for exhausted
or expired records; it must not be treated as a copy of the complete original DynamoDB stream
payload. AWS also supports S3 as an on-failure destination when retaining the complete original
invocation payload is required, but Task 013 does not add S3.

Both Lambdas are outside a VPC: SQS, DynamoDB, EventBridge, and CloudWatch do not require private
application networking for these flows, and avoiding a VPC also avoids NAT Gateway cost. No
dashboards, alarms, customer-managed KMS keys, or unrelated compute/networking resources are
included. Production must review `RETAIN`, deletion protection, PITR, operational retention, and
disaster-recovery settings.

Safe outputs additionally expose the Reservations stream ARN, outcome relay function name, and
relay failure queue names. These definitions have not been deployed.

## OrderWorkflowStack

Task 015 defines CDK infrastructure for the Task 014 Order-side participant in the
choreography-based Saga:

```text
Existing SmartRetailX EventBridge bus
  -> InventoryReserved | InventoryRejected rule
  -> Order Workflow SQS queue
  -> Order Workflow Lambda
  -> Existing Orders DynamoDB table
```

The CDK application creates `OrderEventsStack` first and passes its public EventBridge bus and
Orders table constructs into `OrderWorkflowStack`. Strong cross-stack references preserve one
custom bus and one Orders table; this stack creates neither resource and performs no ARN or table
name lookup.

The single rule matches source `smartretailx.inventory-service` and exactly the detail types
`InventoryReserved` and `InventoryRejected`. Its SQS target has no input path or transformer, so the
complete EventBridge envelope reaches the Task 014 parser. The generated queue resource policy
allows the EventBridge service to send to this source queue under a condition scoped to that rule
ARN; it grants no wildcard SQS access or DLQ delivery.

The Standard `smartretailx-order-workflow-dev` queue uses SQS-managed encryption, four-day
retention, a 120-second visibility timeout, and redrive after five receives. Its terminal Standard
DLQ uses SQS-managed encryption and 14-day retention without another DLQ. This redrive path handles
events successfully delivered to SQS that repeatedly fail application processing; EventBridge
target-delivery failures are outside Task 015.

The Node.js 22 `smartretailx-order-workflow-dev` Lambda is bundled from
`domains/order/service/src/order-workflow-handler.ts` with repository-root dependency resolution.
It has 256 MB memory, a 15-second timeout, a dedicated seven-day log group, and only
`ORDERS_TABLE_NAME` in its application environment. Its DynamoDB policy is scoped to the existing
Orders table and permits only `GetItem` and `UpdateItem`. The SQS integration adds the required
source-queue consumer operations but no `SendMessage` or terminal-DLQ application access.

The event source mapping uses batches of 10, zero added batching delay, and
`ReportBatchItemFailures`. Consequently, Task 014's `UPDATED` and `ALREADY_APPLIED` outcomes
succeed, while malformed messages, missing orders, contradictory terminal outcomes, and transient
DynamoDB failures retry individually and can eventually reach the terminal DLQ. The Lambda has no
asynchronous Lambda DLQ or destination because SQS redrive is the failure mechanism.

The Lambda remains outside a VPC because SQS, DynamoDB, EventBridge, and CloudWatch do not require
private application networking for this workload. The stack adds no NAT Gateway, expensive
always-on service, customer-managed KMS key, dashboard, or alarm. Active Lambda tracing emits
sampled invocation segments to X-Ray. The function also has
no EventBridge publishing permission: the Orders record remains the durable source of truth, and the
separate unified Orders CDC relay publishes `OrderConfirmed`/`OrderRejected` only after the durable
transition.

Safe outputs expose the workflow queue name and URL, DLQ name, Lambda name, and routing-rule name.
The Task 015 infrastructure definition has not been deployed.

## OrderRegistryStack

Task024 defines one private `smartretailx-order-service-dev` ECR repository in a separately
deployable stack. Tags are immutable, basic scanning runs on push, untagged images expire after
seven days, and only the ten most recent images are retained. The repository uses ECR's standard
AES-256 server-side encryption and a development `DESTROY` removal policy, but is not force-emptied
by a custom resource. Outputs expose only its name and URI.

The service stack accepts an explicit immutable image tag through CDK context as
`-c orderImageTag=<source-version>`. Local synth defaults to `task024-local-placeholder` and emits
a validation warning; that placeholder and `latest` must never pass a deployment gate.

## OrderServiceStack

Task024 synthesizes the secure Order HTTP path without changing ownership of the existing Orders
table or Saga resources. Task025 locally adds one customer access GSI to the existing
OrderEvents-owned GlobalTable and application authorization configuration; none is deployed:

```text
Order HTTP API + Cognito JWT authorizer
  -> VPC Link
  -> internal ALB
  -> Fargate task on port 3000
  -> imported smartretailx-orders-dev table
     -> customer Query on customerId-createdAt-index
     -> admin Scan on the base table
```

The stack creates one `10.24.0.0/16` VPC with two public subnets and no NAT Gateway. The development
task receives a public IP for outbound ECR, DynamoDB and CloudWatch connectivity, but task ingress
is allowed only from the ALB security group. The internal ALB accepts only VPC Link security-group
traffic. It uses an IP target group and `/health` checks; `/health` is not an API Gateway route.

The Fargate task uses 256 CPU units, 512 MiB, desired count one, deployment rollback, and CPU target
tracking between one and two tasks. It runs the production DynamoDB composition as non-root `node`
with a read-only root filesystem, dropped capabilities, an init process and no ECS Exec. The task
role has only `GetItem`, `PutItem`, and `Scan` against the existing Orders table, `Query` on the
exact `customerId-createdAt-index` ARN, and the two X-Ray write actions required by the telemetry
collector. A separate
execution role has repository pull and log-write permissions. The service has no direct
EventBridge permission; the existing DynamoDB Stream relay remains the lifecycle publisher.

The task starts a pinned AWS Distro for OpenTelemetry collector sidecar and waits for its health
check before starting the Order container. OpenTelemetry Node auto-instrumentation captures a
bounded 10% sample of Express, HTTP, and AWS SDK spans and sends them over the task-local OTLP
endpoint; the collector exports those traces to X-Ray. The collector shares the existing seven-day
container log group and does not receive credentials or expose a public listener.

All three existing application routes require the reused Cognito issuer/audience and `openid`
scope. The private integration overwrites the backend path with stage-free `$request.path`.
Development CORS permits only `http://localhost:5173`, and seven-day structured API/container logs
exclude secrets and payloads. Safe outputs expose identifiers and endpoints only.

The task receives only the existing public Cognito issuer and SPA client ID for independent access
token verification. It accepts exactly one `customer` or `admin` group. The public create body
excludes `customerId`; customers create with a deterministic UUID v5 identity, Query only their GSI
partition, and get only owned Orders. Admins list/read all but cannot create. Ownership mismatch is
the same `404` as absence. The API does not trust forwarded identity headers, and authorization
telemetry excludes tokens, subjects, claims and request bodies.

The OrderEvents GlobalTable still uses `orderId` as its primary key, `PAY_PER_REQUEST`, one current
region replica, `NEW_AND_OLD_IMAGES` and the existing lifecycle relay. The one GSI uses string
`customerId`/`createdAt` keys with `ALL` projection. It must be deployed separately in a future gate
and verified `ACTIVE` with `DescribeTable` before OrderService deployment; CloudFormation
`UPDATE_COMPLETE` alone is insufficient. Both Task024 stacks, the Task025 GSI and the image remain
undeployed/unpushed.

## Review commands

From the repository root, synthesize without deploying:

```bash
npm run cdk:synth
```

Inspect the local change set, when AWS credentials and bootstrap state are already configured:

```bash
npm run cdk:diff
```

The stacks create infrastructure code only. Task 017 changes only the existing Orders stream view;
no deployment has occurred. Production hardening
remains pending: deletion protection, `RETAIN` policies, PITR for the non-Orders tables,
disaster-recovery configuration, production CORS origins, and later encryption-key review.
