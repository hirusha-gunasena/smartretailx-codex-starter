# Catalogue service

The Catalogue Service owns product catalogue business logic and exposes it through an API Gateway HTTP API-compatible Lambda boundary. Its domain and application layers remain independent of AWS and HTTP frameworks.

## Architecture

- `domain` contains the product model and typed catalogue errors.
- `application/ports` defines deterministic clock, ID generator, and persistence abstractions.
- `application/use-cases` contains explicit create, get, list, update, and delete operations.
- `adapters/dynamodb` implements `ProductRepository` with AWS SDK v3 and validates stored records against the shared Product schema.
- `adapters/http` parses API Gateway payload format 2.0 events and maps application results/errors to shared API response envelopes.
- `composition` wires injected dependencies and validates runtime configuration.
- `runtime` supplies production implementations of the clock and ID generator using Node built-ins.
- `test/support` contains the in-memory repository used only by unit tests.

`ProductRepository` represents catalogue persistence without exposing DynamoDB or any other storage technology. Implementations must copy product values at their boundary so callers cannot mutate stored state by reference.

The production Lambda entry point creates its DynamoDB client outside the handler so warm invocations reuse the client.

## Configuration

`PRODUCTS_TABLE_NAME` is required at Lambda startup. AWS region and credentials are resolved through the standard AWS SDK provider chain and are never hardcoded.

## Supported routes

- `GET /api/v1/products`
- `POST /api/v1/products`
- `GET /api/v1/products/{productId}`
- `PATCH /api/v1/products/{productId}`
- `DELETE /api/v1/products/{productId}`

## Infrastructure status

No DynamoDB table, API Gateway, Lambda resource, IAM role, or other AWS infrastructure is created or deployed by this task. Task 005 remains responsible for CDK infrastructure.

## Commands

From the repository root:

```bash
npm --workspace @smartretailx/catalogue-service run typecheck
npm --workspace @smartretailx/catalogue-service run build
npm --workspace @smartretailx/catalogue-service test
```
