# Order Service

The Order Service is the container-ready SmartRetailX order-processing boundary. It supports order
creation, retrieval, listing, and a lightweight health check. Task 007 adds DynamoDB persistence
code without creating or changing any DynamoDB infrastructure.

## Architecture

- `domain` owns order validation, status, typed errors, immutable snapshots, and total calculation.
- `application` contains create, get, and list use cases plus storage, clock, ID, and future event
  publishing ports.
- `adapters/http` exposes the Express API and maps results and failures to shared response envelopes.
- `adapters/persistence` supplies an in-memory repository for local development and tests.
- `adapters/dynamodb` supplies the production persistence adapter and AWS SDK document-client
  factory without exposing SDK types to the domain or application layers.
- `composition` wires dependencies and centralizes process configuration.

The local entry point explicitly composes `InMemoryOrderRepository`. The separate production entry
point composes one `DynamoDBClient`, one `DynamoDBDocumentClient`, and one
`DynamoDBOrderRepository`, then reuses them across requests through the existing order use cases and
Express application. The `EventPublisher` port remains intentionally unused; Task 007 publishes no
events.

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

| Variable            | Local default | Description                                     |
| ------------------- | ------------- | ----------------------------------------------- |
| `PORT`              | `3000`        | Listening port from 1 through 65535             |
| `ORDERS_TABLE_NAME` | Not used      | Required non-empty name for production DynamoDB |

Both servers bind to `0.0.0.0` so they are reachable inside a container. AWS region and credentials
are not hardcoded; the AWS SDK uses its standard runtime configuration chain. Production
composition fails before listening when `ORDERS_TABLE_NAME` is missing or empty.

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

## Docker

Because the service consumes the shared API-contract workspace, build from the repository root so
Docker can copy both workspaces:

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

No DynamoDB table, CDK infrastructure, EventBridge publishing, or other AWS resource is created or
changed by this task. Reliable order-event publication remains a separate future task.
