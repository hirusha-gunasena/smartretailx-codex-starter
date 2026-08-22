# Saga correlation telemetry local review — 2026-08-21

Status: implemented and unit-tested locally, not deployed.

Each successful asynchronous stage will emit one JSON record with `event = "saga.success"`:

| Stage                     | Success outcomes                    |
| ------------------------- | ----------------------------------- |
| `ORDER_LIFECYCLE_RELAY`   | `PUBLISHED`                         |
| `INVENTORY_RESERVATION`   | `RESERVED`, `REJECTED`, `DUPLICATE` |
| `INVENTORY_OUTCOME_RELAY` | `PUBLISHED`                         |
| `ORDER_WORKFLOW`          | `UPDATED`, `ALREADY_APPLIED`        |

Every record contains only `requestId`, `eventId`, `eventType`, `eventVersion`, `occurredAt`,
`correlationId`, `orderId`, `stage`, and `outcome`. Tests verify that customer IDs, item payloads,
authorization material, tokens, email addresses, and passwords are absent. A record is emitted only
after the durable write or EventBridge publication succeeds; failed records do not produce false
success telemetry.

After a separately approved deployment and Saga success test, query these existing log groups:

- `/aws/lambda/smartretailx-order-event-relay-dev`
- `/aws/lambda/smartretailx-inventory-consumer-dev`
- `/aws/lambda/smartretailx-inventory-outcome-relay-dev`
- `/aws/lambda/smartretailx-order-workflow-dev`

Suggested CloudWatch Logs Insights query:

```text
fields @timestamp, stage, outcome, requestId, eventId, eventType, eventVersion, correlationId, orderId
| filter event = "saga.success" and correlationId = "<approved-test-correlation-uuid>"
| sort @timestamp asc
```

Active X-Ray tracing is not included. Enabling it would add X-Ray write permissions to Lambda
execution roles, conflicting with the current instruction not to modify IAM. It requires a separate
IAM and cost review before implementation.
