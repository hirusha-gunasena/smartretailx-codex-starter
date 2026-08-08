# Test Strategy

## Unit tests
Test domain rules without AWS:
- Product validation
- Order totals and state transitions
- Inventory reservation outcomes
- Event construction and parsing
- RBAC decisions
- Idempotency decisions

## Component/API tests
- Lambda handlers with representative API Gateway events
- Express endpoints with Supertest
- Invalid JSON and validation failures
- Authentication and authorization failures
- Consistent error envelopes

## Integration tests
- DynamoDB repositories against local emulation or isolated AWS test resources
- EventBridge publisher and SQS consumer boundaries
- Conditional inventory updates
- DLQ behavior

## End-to-end
1. Create a product.
2. Set inventory.
3. Authenticate a customer.
4. Submit an order.
5. Observe inventory reservation.
6. Verify order status.
7. Verify notification.

## Performance
k6 scenarios:
- Baseline
- Normal load
- Stress
- Spike

Capture p50, p95, p99, throughput, error rate, ECS CPU/memory, Lambda duration, queue depth and throttles.

## Security tests
- Missing, invalid and expired JWTs
- Role violations
- Payload size and schema validation
- Injection-style input handling
- Secret scanning
- Dependency audit
- IAM policy review
