# SmartRetailX Architecture

## System overview

SmartRetailX is an AWS distributed web application built as a TypeScript monorepo. Public APIs are
versioned under `/api/v1`. Synchronous requests use API Gateway, while the Order and Inventory
workflow uses DynamoDB Streams, EventBridge, and SQS for durable asynchronous processing.

```text
Browser -> CloudFront/S3 -> React application
Browser -> Cognito -> access token
Browser -> API Gateway HTTP APIs
  -> Catalogue Lambda -> Products DynamoDB / product-assets S3
  -> VPC Link -> internal ALB -> Order service on ECS Fargate -> Orders DynamoDB
```

## Service boundaries

### Product Catalogue

The Catalogue service is a Lambda application behind API Gateway. It owns Product records in
DynamoDB and product assets in S3. API Gateway validates Cognito access tokens, and the Lambda
enforces group-based authorization: customers and administrators can read, while only
administrators can create, update, or delete Products.

### Order Processing

The Order service is an Express application packaged with Docker and deployed to ECS Fargate. API
Gateway provides the public JWT-protected endpoint and reaches the internal Application Load
Balancer through a VPC Link. The service verifies the original Cognito access token, derives a
stable customer identity from the token subject, and enforces customer ownership for create, list,
and get operations. It owns the Orders DynamoDB table and exposes `/health` to the internal target
group.

### Inventory Management

The Inventory service consumes `OrderCreated` events from SQS. It aggregates repeated product lines
and performs stock updates plus a durable Reservation outcome in one DynamoDB transaction. The
canonical event ID is the reservation key and transaction token, preventing duplicate delivery from
decrementing stock more than once. A separate stream relay publishes Inventory outcomes to the
shared EventBridge bus.

### Authentication

The Auth stack defines a Cognito User Pool, public SPA client, hosted domain, and `customer` and
`admin` groups. The browser uses Authorization Code Grant with PKCE. The SPA client has no client
secret.

## Order lifecycle

```text
POST /api/v1/orders
  -> Orders table: PENDING
  -> Orders stream INSERT
  -> Order lifecycle relay
  -> EventBridge: OrderCreated
  -> Inventory SQS queue
  -> Inventory consumer transaction
  -> Reservations stream INSERT
  -> Inventory outcome relay
  -> EventBridge: InventoryReserved | InventoryRejected
  -> Order Workflow SQS queue
  -> Order Workflow Lambda
  -> Orders table: CONFIRMED | REJECTED
  -> Orders stream MODIFY
  -> Order lifecycle relay
  -> EventBridge: OrderConfirmed | OrderRejected
```

The APIs write only their own durable data and do not publish an event in the same request. Stream
relays publish from committed DynamoDB state, avoiding database/event-bus dual writes. Consumers
are idempotent because AWS stream and queue delivery is at least once.

Every canonical asynchronous event contains `eventId`, `eventType`, `eventVersion`, `occurredAt`,
`source`, `correlationId`, and `data`. Lifecycle event identifiers are deterministic so retries do
not create new logical events.

## Data ownership

| Service        | Store                               | Owned data                                                               |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Catalogue      | DynamoDB Products and S3 assets     | Product records and media                                                |
| Order          | DynamoDB Orders                     | Order identity, ownership, totals, status, and terminal outcome metadata |
| Inventory      | DynamoDB Inventory and Reservations | Stock and idempotent reservation outcomes                                |
| Authentication | Cognito                             | Users, application groups, and OAuth client configuration                |

Services do not directly modify another service's table. The Order Workflow consumer is an explicit
Order-owned adapter that applies Inventory outcomes to the Orders table.

## Reliability and failure handling

- Every business SQS queue has a terminal dead-letter queue.
- Event source mappings use partial batch failure responses so successful records are not retried.
- Queue visibility timeouts exceed consumer Lambda timeouts.
- DynamoDB conditional writes and transactions enforce state transitions and stock consistency.
- Stream relays use bounded retries, record-age limits, batch bisection, and encrypted failure
  destinations.
- The Order service has health checks, deployment rollback, and autoscaling configuration.
- DynamoDB point-in-time recovery is enabled for Orders; production hardening is still required for
  the remaining development tables.

## Security

- Cognito and API Gateway validate authentication at the public boundary.
- Catalogue RBAC and Order role/ownership checks fail closed.
- The Order Application Load Balancer is internal and task ingress is limited to the ALB security
  group.
- Lambda and ECS roles use resource-scoped, operation-specific IAM policies.
- Resource names, account IDs, ARNs, credentials, and endpoints are supplied through CDK references
  or environment configuration, not embedded in application source.
- DynamoDB, S3, SQS, ECR, and CloudWatch use AWS-managed encryption appropriate to the development
  configuration.

## Observability

Applications emit structured JSON logs and propagate request, correlation, and event identifiers.
The asynchronous Saga stages emit sanitized success telemetry only after durable state changes or
event publication succeeds. CloudWatch dashboards and alarms cover API, Lambda, ECS, SQS, and
DynamoDB signals. Lambda tracing uses X-Ray; the Order task uses OpenTelemetry with an AWS Distro
for OpenTelemetry sidecar that exports sampled traces to X-Ray.

## Infrastructure

AWS CDK v2 source is stored in `infrastructure` and synthesizes CloudFormation. The development
configuration includes Cognito, API Gateway, Lambda, DynamoDB, S3, EventBridge, SQS, SNS alarm
notifications, ECR, ECS Fargate, an internal ALB, CloudFront, CloudWatch, and X-Ray resources.

Kubernetes is not used. No deployment is performed by source build or synthesis commands. Review
`DEPLOYMENT.md`, AWS identity, region, cost, and `cdk diff` before deploying.
