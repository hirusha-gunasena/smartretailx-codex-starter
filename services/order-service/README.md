# Order Service

The Order Service is the local, container-ready SmartRetailX order-processing boundary. Task 006
supports order creation, retrieval, listing, and a lightweight health check without using AWS.

## Architecture

- `domain` owns order validation, status, typed errors, immutable snapshots, and total calculation.
- `application` contains create, get, and list use cases plus storage, clock, ID, and future event
  publishing ports.
- `adapters/http` exposes the Express API and maps results and failures to shared response envelopes.
- `adapters/persistence` supplies an in-memory repository for local development and tests only.
- `composition` wires dependencies and centralizes process configuration.

The `EventPublisher` port is intentionally unused. Task 007 will bind it to the shared
`OrderCreated` event; Task 006 publishes no events.

## Routes

| Method | Route                     | Result                     |
| ------ | ------------------------- | -------------------------- |
| GET    | `/health`                 | Lightweight process health |
| POST   | `/api/v1/orders`          | Create a `PENDING` order   |
| GET    | `/api/v1/orders`          | List locally stored orders |
| GET    | `/api/v1/orders/:orderId` | Retrieve one order         |

Malformed or invalid requests return `400`, unknown valid order IDs return `404`, and unexpected
failures return a generic `500` without internal details. An invalid order ID path value returns
`400`. CORS is not enabled in this local service.

Production order listing will require pagination; Task 006 deliberately returns the complete
in-memory list.

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

| Variable | Default | Description                         |
| -------- | ------- | ----------------------------------- |
| `PORT`   | `3000`  | Listening port from 1 through 65535 |

The server always binds to `0.0.0.0` so it is reachable inside a container. No AWS credentials or
AWS configuration are read by this service.

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

Run its tests with:

```bash
npm --workspace @smartretailx/order-service test
```

## Docker

Because the service consumes the shared API-contract workspace, build from the repository root so
Docker can copy both workspaces:

```bash
docker build -f services/order-service/Dockerfile -t smartretailx-order-service:dev .
docker run --rm -p 3000:3000 smartretailx-order-service:dev
```

Then request `http://localhost:3000/health`. The multi-stage image compiles TypeScript in the builder,
installs production dependencies only in the runtime stage, and runs as the non-root `node` user.

## Future AWS architecture

Later bounded tasks will add ECS Fargate behind an ALB, a DynamoDB-owned order repository, and
EventBridge publishing. None of ECS, ALB, DynamoDB, EventBridge, or any other AWS component is
implemented or deployed by Task 006.
