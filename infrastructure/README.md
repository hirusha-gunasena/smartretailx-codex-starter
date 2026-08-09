# SmartRetailX infrastructure

The CDK application keeps bounded workloads in separate stacks. `FoundationStack` remains the
repository scaffold, `CatalogueStack` defines the Product Catalogue API, and `OrderEventsStack`
defines the reliable `OrderCreated` relay infrastructure.

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
