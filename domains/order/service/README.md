# Order Service

The Order Service is the container-ready SmartRetailX order-processing boundary. It supports order
creation, retrieval, listing, and a lightweight health check. It also contains the unified Order
lifecycle event relay and Task 014 order workflow consumer code. Task 015 defines the consumer's AWS
infrastructure separately in CDK; none of it has been deployed.

## Architecture

- `domain` owns order validation, status, typed errors, immutable snapshots, and total calculation.
- `application` contains create, get, list, and inventory-outcome processing use cases plus their
  storage, clock, ID, and event publishing ports.
- `adapters/http` exposes the Express API and maps results and failures to shared response envelopes.
- `adapters/auth` verifies Cognito access tokens and reduces verified claims to an opaque subject
  and exact `customer`/`admin` role.
- `adapters/persistence` supplies an in-memory repository for local development and tests.
- `adapters/dynamodb` supplies the production persistence adapter and AWS SDK document-client
  factory without exposing SDK types to the domain or application layers.
- `adapters/events` maps order stream records, publishes canonical events, and handles partial batch
  failures without exposing AWS SDK types to the domain or application layers.
- `composition` wires dependencies and centralizes process configuration.

The local entry point explicitly composes `InMemoryOrderRepository`. The separate production entry
point composes one `DynamoDBClient`, one `DynamoDBDocumentClient`, and one
`DynamoDBOrderRepository`, then reuses them across requests through the existing order use cases and
Express application. The separate event-relay entry point composes its EventBridge publisher once
for reuse by a future Lambda runtime. The workflow-consumer entry point likewise composes one
document client for reuse across an SQS batch and warm Lambda invocations.

## Routes

| Method | Route                     | Result                                                           |
| ------ | ------------------------- | ---------------------------------------------------------------- |
| GET    | `/health`                 | Lightweight process health                                       |
| POST   | `/api/v1/orders`          | Customer creates a `PENDING` order with server-derived ownership |
| GET    | `/api/v1/orders`          | Customer lists own Orders; admin lists all                       |
| GET    | `/api/v1/orders/:orderId` | Customer reads own Order; admin reads any existing Order         |

Missing/invalid access tokens return `401`; unsupported, ambiguous or insufficient roles return
`403`; malformed requests return `400`; and unknown valid order IDs return `404`. A customer asking
for another customer's Order gets the same `404` envelope as an absent Order. Unexpected failures
return a generic `500` without internal details. CORS is not enabled inside the service. `/health`
is unauthenticated inside the container, does not call DynamoDB, and is not routed by API Gateway.

The public list contract has no pagination. The DynamoDB adapter therefore follows every Query page
for customer lists and every Scan page for admin lists before returning the collected result.

## Domain rules

- IDs are UUIDs and every order contains at least one valid line item.
- Quantities are positive integers and unit prices are non-negative finite numbers.
- Clients provide one uppercase, three-letter order currency that applies consistently to all lines.
- The service generates the order ID, calculates the total, sets `PENDING`, and owns timestamps.
- The strict public create body accepts only `items` and `currency`. Client-supplied `customerId`,
  IDs, statuses, totals, and timestamps are rejected.
- A customer's opaque Cognito subject is translated into a stable domain UUID using the pinned
  namespaced UUID v5 mapping `UUIDv5("cognito:" + subject, UUIDv5("customers.smartretailx.internal",
DNS))`. The raw subject is neither persisted as `customerId` nor logged.
- `PENDING` orders contain no terminal outcome metadata; `CONFIRMED` requires a UUID
  `reservationId`, while `REJECTED` requires a non-empty `rejectionReason`.
- Repository boundaries deep-copy orders and nested items.

Shared contracts currently represent money as JavaScript decimal numbers. To preserve that API,
the service converts line prices to a common decimal scale before integer multiplication and
addition, supporting up to 12 decimal places while values remain within JavaScript's safe integer
range. A future money contract should use fixed minor units or an explicit decimal representation.

## Configuration

| Variable                      | Local default | Description                                      |
| ----------------------------- | ------------- | ------------------------------------------------ |
| `PORT`                        | `3000`        | Listening port from 1 through 65535              |
| `ORDERS_TABLE_NAME`           | Not used      | Required by production HTTP and workflow paths   |
| `COGNITO_USER_POOL_ISSUER`    | None          | Existing canonical Cognito issuer; public config |
| `COGNITO_USER_POOL_CLIENT_ID` | None          | Existing public SPA client ID                    |
| `ORDER_EVENT_BUS_NAME`        | Not used      | Required only by the production event relay      |

Both servers bind to `0.0.0.0` so they are reachable inside a container. AWS region and credentials
are not hardcoded; the AWS SDK uses its standard runtime configuration chain. Production
composition fails before listening when its table or Cognito verifier configuration is invalid.
The User Pool ID is derived from and checked against the canonical trusted issuer, avoiding a new
Auth-stack value. JWT verification uses public Cognito JWKS and requires no Cognito Admin API call
or static AWS credential. Event-relay composition independently fails when
`ORDER_EVENT_BUS_NAME` is missing or empty.

## Order workflow Saga consumer

Task 014 adds application and adapter code for the Order-side participant in the choreography-based
Saga. Task 015 now defines—but does not deploy—the EventBridge rule, SQS queue, DLQ, Lambda, event
source mapping, IAM policy, logs, and outputs for this path:

```text
InventoryReserved | InventoryRejected on EventBridge
  -> Order Workflow SQS queue
  -> Order Workflow Lambda
  -> existing Orders DynamoDB table
```

The consumer validates the complete EventBridge wrapper, including routing source
`smartretailx.inventory-service`, then validates `detail` with the existing shared canonical event
schema. `detail-type` and the canonical event type must agree. It also requires `correlationId` to
equal `data.orderId`, preserving the invariant established when the workflow began.

`InventoryReserved` requests `PENDING -> CONFIRMED`; `InventoryRejected` requests
`PENDING -> REJECTED`. DynamoDB performs the initial terminal transition with one conditional
`UpdateCommand`. A confirmation atomically writes `status`, `updatedAt`, and the incoming
`reservationId`; a rejection writes `status`, `updatedAt`, and the incoming reason as
`rejectionReason`. Each branch removes the incompatible terminal metadata field without replacing
the Order item or changing immutable business data. The condition requires an existing `PENDING`
order and rejects an outcome timestamp earlier than immutable `createdAt`. Canonical `occurredAt`
is used as deterministic `updatedAt`, so retries never replace business time with processing time.

After a conditional failure, a strongly consistent read distinguishes safe duplicates from faults.
An already matching terminal state is acknowledged only when its `reservationId` or
`rejectionReason` also matches the incoming outcome. This performs no second write and preserves the
original metadata and `updatedAt`. A same-status outcome with different metadata, an opposite
terminal state, or a missing order fails processing. Conflicts never flip the Order and remain
eligible for retry and the future DLQ because they require investigation.

The SQS handler processes records independently and returns failed SQS `messageId` values through
`batchItemFailures`; successful updates and safe duplicates are omitted. Task 015 explicitly
configures the event source mapping with `ReportBatchItemFailures`; the response shape alone would
not enable partial retries. The source queue retries failed messages and sends them to its terminal
DLQ after five receives. This is an application-processing redrive path, not an EventBridge
target-delivery failure queue.

The workflow Lambda receives only `ORDERS_TABLE_NAME`. Its table-scoped application IAM permits
only DynamoDB `GetItem` and `UpdateItem`, while the SQS integration supplies narrow source-queue
consumer permissions. It has no source-queue send permission, terminal-DLQ application access,
EventBridge environment variable, or EventBridge publishing permission. The Lambda stays outside
a VPC because its required AWS services do not require private networking.

The consumer does not publish `OrderConfirmed` or `OrderRejected`. The updated Order is the durable
source of truth, avoiding a DynamoDB/EventBridge dual write. The unified Orders DynamoDB Stream
relay publishes terminal events from the resulting `MODIFY` records after the durable update.

There is no distributed ACID transaction across Order and Inventory. Each service owns its state:
the Order begins `PENDING`, Inventory records its outcome independently, and asynchronous delivery
eventually advances the Order to `CONFIRMED` or `REJECTED`. Duplicate delivery is tolerated,
conditional writes prevent terminal-state flips, transient failures remain retryable, and
irreconcilable outcomes are left for operational failure handling. Payment and compensation are not
part of this workflow yet.

Task 016A adds this terminal metadata to the durable Order shape because the canonical future
`OrderConfirmed` event requires `reservationId` and `OrderRejected` requires a reason. Persisting
the values atomically with the status transition lets a later Orders DynamoDB Stream relay construct
those events solely from durable stream images, without querying Inventory or inventing data. Task
016A does not publish terminal events and makes no infrastructure change; Task 016 consumes this
metadata through the existing CDC application path.

## Local development and tests

From the repository root:

```bash
npm install
npm --workspace @smartretailx/order-service run dev
```

The service is then available at `http://localhost:3000`. A compiled local run uses:

```bash
npm --workspace @smartretailx/order-service run build
npm --workspace @smartretailx/order-service start
```

The `start` command is explicitly the in-memory development path. To use the production persistence
composition after building, set `ORDERS_TABLE_NAME` in the runtime environment and run:

```bash
npm --workspace @smartretailx/order-service run start:production
```

Production composition does not create a table. It expects an externally provisioned table whose
partition key is the string attribute `orderId`.

Run the service tests with:

```bash
npm --workspace @smartretailx/order-service test
```

The DynamoDB unit tests inject a mocked document client and do not contact AWS or require AWS
credentials.

## Unified Order lifecycle CDC relay

`CreateOrder` deliberately writes only the order. Writing DynamoDB and then directly publishing to
EventBridge would be a dual write: either operation could succeed while the other fails, leaving the
system inconsistent. Task 016 extends the existing Task 008 relay rather than introducing a second
Orders stream consumer:

```text
Orders DynamoDB table
       |
       | NEW_AND_OLD_IMAGES
       v
 Unified Order Lifecycle Relay
       |
       +-- INSERT PENDING
       |     -> OrderCreated
       |
       +-- PENDING -> CONFIRMED
       |     -> OrderConfirmed
       |
       +-- PENDING -> REJECTED
             -> OrderRejected
```

For `INSERT`, the relay preserves the Task 008 behavior: it requires `NewImage`, validates the
durable Order with the shared strict schema, requires `PENDING`, and constructs canonical
`OrderCreated`. For `MODIFY`, it requires and validates both images, confirms identity and immutable
business fields, and requires monotonic lifecycle timestamps. Only `PENDING -> CONFIRMED` and
`PENDING -> REJECTED` publish terminal events. State-preserving changes are ignored; terminal flips,
rollbacks, terminal-metadata changes, and immutable-field mutations fail the record. `REMOVE`
remains ignored.

Terminal events are constructed solely from durable Order state. `OrderConfirmed.reservationId`
comes directly from the new `CONFIRMED` image, and `OrderRejected.reason` comes directly from the
new `REJECTED` image's `rejectionReason`. No Inventory query, fallback value, or replacement
identifier is used. Event `occurredAt` is the new durable `updatedAt`, while `correlationId` remains
the Order ID.

DynamoDB Streams and Lambda are at-least-once systems, so retries and duplicate delivery are
expected. The relay derives a UUID v5 from the standard URL namespace and
`smartretailx:<eventType>:<orderId>`. Reprocessing a lifecycle transition therefore yields the same
event ID, while `OrderCreated`, `OrderConfirmed`, and `OrderRejected` IDs remain distinct for one
Order. Downstream consumers must remain idempotent and deduplicate by `eventId`.

The EventBridge entry uses source `smartretailx.order-service` for namespaced AWS routing, while the
shared envelope retains its established source `order-service` for compatibility with the canonical
contract. A resolved `PutEvents` call is accepted only when its submitted entry did not fail.

The batch handler returns failed stream sequence numbers through `batchItemFailures`, allowing
successful publications and ignored records to avoid unnecessary retries. It continues processing
later records after a representable failure. The existing event-source mapping enables
`ReportBatchItemFailures`, and Task 017 preserves that behavior with the updated stream view. If a
failed record has no sequence number, the handler throws a typed error because inventing a retry
identifier would be unsafe.

Task 016 changes application and adapter code only. Task 017 changes the single existing CDK stream
to `NEW_AND_OLD_IMAGES` while preserving the same relay Lambda, event-source mapping, failure path,
and partial-batch behavior. Neither task creates another relay. Task 014 remains responsible only
for the atomic durable Order update and has no EventBridge publication path. These infrastructure
definitions have not been deployed.

## Docker

Because the service consumes both shared contract workspaces, build from the repository root so
Docker can copy all required workspaces:

```bash
docker build -f services/order-service/Dockerfile -t smartretailx-order-service:dev .
docker run --rm --read-only --init --cap-drop ALL --user node \
  -e ORDERS_TABLE_NAME=smartretailx-orders-dev \
  -e COGNITO_USER_POOL_ISSUER=<existing-cognito-issuer> \
  -e COGNITO_USER_POOL_CLIENT_ID=<existing-public-client-id> \
  -p 3000:3000 smartretailx-order-service:dev
```

Then request `http://localhost:3000/health`. The multi-stage image compiles TypeScript in the builder,
installs production dependencies only in the runtime stage, runs as the non-root `node` user, and
uses the production DynamoDB entry point. The example table name is configuration only: do not run
write routes against a live table during a smoke test. The process handles `SIGTERM` and `SIGINT`,
stops accepting new work, closes the HTTP server, and emits sanitized structured shutdown logs.

The external API authorizer and the container both validate authentication. The backend sees the
original bearer token through the HTTP proxy integration and independently verifies signature,
issuer/User Pool, app client, expiry, access-token use and `openid` scope before exact group/RBAC
and ownership checks. It does not trust `x-role`, `x-user-id`, `x-customer-id` or other caller
identity headers.

## DynamoDB list access patterns

Customer listing uses `QueryCommand` against the exact `customerId-createdAt-index` partition and
never uses Scan plus filtering as ownership control. The single GSI uses `customerId` as its string
partition key, `createdAt` as its string sort key, and `ALL` projection so complete Orders can be
returned without a read per item. Admin listing retains the existing full-table Scan. Both paths
collect every page to preserve the current unpaginated response contract; a future scale-oriented
contract should introduce an opaque, role-safe continuation token deliberately.

Task025 defines but does not deploy the GSI. A future gate must update only OrderEvents, wait for a
stable stack, and use `DescribeTable` until the index reports `ACTIVE` before deploying or starting
the Order service against it. The existing Orders primary key, billing, `NEW_AND_OLD_IMAGES` stream,
relay and Saga semantics are unchanged.

The same application container can later run on EKS: its runtime inputs are a standard bearer
token, public Cognito verifier configuration, DynamoDB configuration and normal AWS workload
credentials. It does not use ECS metadata, ECS cluster/service identity, ECS Exec, instance
identity or ALB authentication headers for end-user identity. A future EKS design would replace the
workload-IAM wiring at the infrastructure layer; Task025 intentionally adds no Kubernetes
manifests.

The Task 009 CDK stack now defines the Orders table, stream, relay Lambda, failure destination, and
custom EventBridge bus. Those definitions have not been deployed, and downstream Inventory routing
remains intentionally absent.
