# SmartRetailX infrastructure

The CDK application keeps bounded workloads in separate stacks. `FoundationStack` remains the
repository scaffold, `CatalogueStack` defines the Product Catalogue API, and `OrderEventsStack`
defines the reliable `OrderCreated` relay infrastructure. `InventoryStack` reuses the Order event
bus and defines the asynchronous Inventory consumer path.

## CatalogueStack

For the `dev` environment, the stack synthesizes:

- one API Gateway HTTP API with a single Lambda proxy integration using payload format 2.0;
- one Node.js 22 Catalogue Lambda bundled from
  `services/catalogue-service/src/handler.ts` with its workspace and AWS SDK dependencies;
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
  on-demand billing, Standard table class, default DynamoDB-owned encryption, and no sort key or
  indexes;
- a `NEW_IMAGE` DynamoDB Stream, which supplies the complete inserted order required by the relay;
- the Node.js 22 `smartretailx-order-event-relay-dev` Lambda bundled from
  `services/order-service/src/order-event-relay.ts` with its application and AWS SDK dependencies;
- the custom `smartretailx-order-events-dev` EventBridge bus, with no rules or cross-account policy;
- a seven-day relay log group; and
- an SQS-managed encrypted relay-failure queue retained for 14 days, plus the repository-required
  dead-letter queue for that destination.

The stream event source mapping starts at `TRIM_HORIZON` to avoid missing records when the mapping
is first established. It uses batches of 10, zero additional batching delay,
`ReportBatchItemFailures`, three retries, batch bisection, and a one-hour maximum record age.
Exhausted or expired records are preserved in the failure destination for debugging. That queue is
not the future Inventory queue.

The relay receives only `ORDER_EVENT_BUS_NAME`; it reads each order from the stream and does not need
table data-plane permissions or `ORDERS_TABLE_NAME`. Its application IAM is limited to
`DescribeStream`, `GetRecords`, `GetShardIterator`, and `ListStreams` on the Orders stream,
`events:PutEvents` on the custom bus, and `sqs:SendMessage` on its failure destination. It has no
`PutItem`, `UpdateItem`, `DeleteItem`, `Scan`, or `Query` permission.

The Lambda is deliberately outside a VPC. DynamoDB Streams, EventBridge, SQS, and CloudWatch do not
require private application networking for this workload, so no VPC or NAT Gateway is created. The
stack also creates no ECS, ALB, EC2, RDS, CloudFront, customer-managed KMS key, EventBridge rules,
or Inventory consumer resources.

Development data is intentionally removable: the table, queues, and log group use `DESTROY`, table
deletion protection and PITR are disabled, and no Global Table replica is configured. A production
variant must use `RETAIN`, deletion protection, PITR, longer operational retention, and a reviewed
Global Tables/disaster-recovery design.

Safe outputs expose the Orders table name and stream ARN, event bus name and ARN, relay function
name, and relay-failure queue name.

## InventoryStack

For the `dev` environment, this stack synthesizes:

- `smartretailx-inventory-dev`, an on-demand Standard DynamoDB table keyed by string `productId`;
- `smartretailx-inventory-reservations-dev`, an on-demand Standard DynamoDB table keyed by string
  `eventId`;
- the SQS-managed encrypted `smartretailx-inventory-orders-dev` source queue with four-day
  retention and a 120-second visibility timeout;
- the SQS-managed encrypted `smartretailx-inventory-orders-dlq-dev` terminal DLQ with 14-day
  retention and source-queue redrive after five receives;
- a Node.js 22 Inventory consumer Lambda bundled from
  `services/inventory-service/src/handler.ts`, with 256 MB memory, a 15-second timeout, and a
  dedicated seven-day log group;
- one precise EventBridge rule matching source `smartretailx.order-service` and detail type
  `OrderCreated`; and
- the SQS event source mapping, least-privilege policies, queue resource policy, and safe outputs.

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
use `DESTROY`. They have no sort keys, indexes, or streams, and no seed custom resource exists. The
Reservations stream and Inventory outcome relay are deliberately deferred to Task 012.

The Lambda is outside a VPC: SQS, DynamoDB, and CloudWatch do not require private application
networking for this flow, and avoiding a VPC also avoids NAT Gateway cost. No dashboards, alarms,
customer-managed KMS keys, or unrelated compute/networking resources are included. Production must
review `RETAIN`, deletion protection, PITR, operational retention, and disaster-recovery settings.

Safe outputs expose both table names, source queue name and URL, DLQ name, function name, and rule
name. These definitions have not been deployed.

## Review commands

From the repository root, synthesize without deploying:

```bash
npm run cdk:synth
```

Inspect the local change set, when AWS credentials and bootstrap state are already configured:

```bash
npm run cdk:diff
```

The stacks create infrastructure code only. No deployment has occurred. Production hardening
remains pending: deletion protection, `RETAIN` policies, point-in-time recovery, disaster-recovery
configuration, production CORS origins, authentication, X-Ray, alarms, and later encryption-key
review.
