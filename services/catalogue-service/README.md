# Catalogue service

The Catalogue Service owns product catalogue business logic. Its current implementation is deliberately limited to the domain and application layers and is independent of AWS and HTTP frameworks.

## Architecture

- `domain` contains the product model and typed catalogue errors.
- `application/ports` defines deterministic clock, ID generator, and persistence abstractions.
- `application/use-cases` contains explicit create, get, list, update, and delete operations.
- `runtime` supplies production implementations of the clock and ID generator using Node built-ins.
- `test/support` contains the in-memory repository used only by unit tests.

`ProductRepository` represents catalogue persistence without exposing DynamoDB or any other storage technology. Implementations must copy product values at their boundary so callers cannot mutate stored state by reference.

## Task 004 boundary

Task 004 can add a DynamoDB repository adapter and API/Lambda handlers around these use cases. It must not move storage or HTTP concerns into the domain/application code.

## Commands

From the repository root:

```bash
npm --workspace @smartretailx/catalogue-service run typecheck
npm --workspace @smartretailx/catalogue-service run build
npm --workspace @smartretailx/catalogue-service test
```
