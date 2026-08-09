# Order Service

The Order Service is the container-ready SmartRetailX order-processing boundary. It supports order
creation, retrieval, listing, and a lightweight health check. It also contains the Task 008 order
event relay code without creating or changing any AWS infrastructure.

## Architecture

- `domain` owns order validation, status, typed errors, immutable snapshots, and total calculation.
- `application` contains create, get, and list use cases plus storage, clock, ID, and event publishing
  ports.
- `adapters/http` exposes the Express API and maps results and failures to shared response envelopes.
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
for reuse by a future Lambda runtime.

## Routes

| Method | Route                     | Result                     |
| ------ | ------------------------- | -------------------------- |
| GET    | `/health`                 | Lightweight process health |
| POST   | `/api/v1/orders`          | Create a `PENDING` order   |
| GET    | `/api/v1/orders`          | List stored orders         |
| GET    | `/api/v1/orders/:orderId` | Retrieve one order         |

Malformed or invalid requests return `400`, unknown valid order IDs return `404`, and unexpected
failures return a generic `500` without internal details. An invalid order ID path value returns
`400`. CORS is not enabled in this service. The health endpoint remains a lightweight process check
and does not call DynamoDB.

The public list contract has no pagination. The DynamoDB adapter therefore follows every scan page
and returns the collected result.

## Domain rules

- IDs are UUIDs and every order contains at least one valid line item.
- Quantities are positive integers and unit prices are non-negative finite numbers.
- Clients provide one uppercase, three-letter order currency that applies consistently to all lines.
- The service generates the order ID, calculates the total, sets `PENDING`, and owns timestamps.
- Client-supplied IDs, statuses, totals, and timestamps are rejected.
- Repository boundaries deep-copy orders and nested items.

Shared contracts currently represent money as JavaScript decimal numbers. To preserve that API,
the service converts line prices to a common decimal scale before integer multiplication and
addition, supporting up to 12 decimal places while values remain within JavaScript's safe integer
range. A future money contract should use fixed minor units or an explicit decimal representation.

## Configuration

| Variable               | Local default | Description                                     |
| ---------------------- | ------------- | ----------------------------------------------- |
| `PORT`                 | `3000`        | Listening port from 1 through 65535             |
| `ORDERS_TABLE_NAME`    | Not used      | Required non-empty name for production DynamoDB |
| `ORDER_EVENT_BUS_NAME` | Not used      | Required only by the production event relay     |

Both servers bind to `0.0.0.0` so they are reachable inside a container. AWS region and credentials
are not hardcoded; the AWS SDK uses its standard runtime configuration chain. Production
composition fails before listening when `ORDERS_TABLE_NAME` is missing or empty. Event-relay
composition independently fails when `ORDER_EVENT_BUS_NAME` is missing or empty.

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

The `start` command is explicitly the in-memory development path and preserves the current Docker
behavior. To use the production persistence composition after building, set `ORDERS_TABLE_NAME` in
the runtime environment and run:

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

## Reliable OrderCreated relay

`CreateOrder` deliberately writes only the order. Writing DynamoDB and then directly publishing to
EventBridge would be a dual write: either operation could succeed while the other fails, leaving the
system inconsistent. The selected change-data-capture path is:

```text
Orders DynamoDB table
  -> DynamoDB Stream INSERT
  -> Order Event Relay Lambda
  -> EventBridge
```

Only `INSERT` records produce `OrderCreated`; `MODIFY` and `REMOVE` are intentionally ignored. The
relay requires `NewImage`, unmarshalls and validates it with the shared `Order` schema, requires
`PENDING` status, and then validates the resulting shared `OrderCreated` contract.

DynamoDB Streams and Lambda are at-least-once systems, so retries and duplicate delivery are
expected. The relay derives a UUID v5 from the standard URL namespace and
`smartretailx:OrderCreated:<orderId>`. The same order therefore retains the same event ID on every
retry. It also uses `orderId` as `correlationId` and `order.createdAt` as `occurredAt`. Downstream
consumers must remain idempotent and deduplicate by `eventId`.

The EventBridge entry uses source `smartretailx.order-service` for namespaced AWS routing, while the
shared envelope retains its established source `order-service` for compatibility with the canonical
contract. A resolved `PutEvents` call is accepted only when its submitted entry did not fail.

The batch handler returns failed stream sequence numbers through `batchItemFailures`, allowing
successful records to avoid unnecessary retries. A future DynamoDB Streams event source mapping
must explicitly enable `ReportBatchItemFailures`; this task adds response behavior only. If a failed
record has no sequence number, the handler throws a typed error because inventing a retry identifier
would be unsafe.

No stream, relay Lambda, EventBridge bus, trigger, event source mapping, or IAM role exists yet.

## Docker

Because the service consumes both shared contract workspaces, build from the repository root so
Docker can copy all required workspaces:

```bash
docker build -f services/order-service/Dockerfile -t smartretailx-order-service:dev .
docker run --rm -p 3000:3000 smartretailx-order-service:dev
```

Then request `http://localhost:3000/health`. The multi-stage image compiles TypeScript in the builder,
installs production dependencies only in the runtime stage, runs as the non-root `node` user, and
continues to use the explicit in-memory entry point.

## DynamoDB listing limitation

Using `ScanCommand` and collecting every page is acceptable for this coursework prototype and
matches the current unpaginated API contract. It is not the preferred query strategy for a large
orders table because cost and latency grow with table size. A future customer-order query will need
a deliberately designed customer-based access pattern, likely a GSI, together with API pagination.
Task 007 does not add that GSI.

No DynamoDB table, stream, CDK infrastructure, EventBridge bus, or other AWS resource is created or
changed by this task. The code is ready for a separately reviewed infrastructure task to wire the
relay to AWS.
