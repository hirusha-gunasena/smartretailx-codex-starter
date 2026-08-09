# Inventory service

The Inventory service is an asynchronous-only consumer responsible for reserving stock for the
canonical `OrderCreated` event. Task 010 creates application and adapter code only; it does not
create or deploy Lambda functions, queues, EventBridge rules, DynamoDB tables, or IAM policies.

## Intended asynchronous flow

The infrastructure-pending delivery path is:

```text
Order EventBridge bus
  -> future OrderCreated rule
  -> future Inventory SQS queue and DLQ
  -> Inventory Lambda handler
  -> Inventory and Inventory Reservations DynamoDB tables
```

The SQS body is expected to contain the standard EventBridge wrapper. The parser validates the
outer `detail-type` as `OrderCreated`, the routing source as `smartretailx.order-service`, and the
nested `detail` with the shared `OrderCreated` schema. The nested event retains the canonical
contract source `order-service`. Account and region fields are required only as non-empty envelope
metadata; no account ID or region is hardcoded.

## Inventory and reservation records

The future Inventory table uses `productId` as its string partition key and conceptually stores:

```text
productId, availableQuantity, updatedAt
```

The future Inventory Reservations table uses canonical `OrderCreated.eventId` as its string
partition key. Each durable outcome stores the event, order, and correlation identities; the
aggregated requested items; `RESERVED` or `REJECTED`; and one injected `processedAt` timestamp. A
rejection stores `INSUFFICIENT_STOCK` plus the product IDs, requested quantities, and decision-time
available quantities that failed their stock conditions.

The reservation record serves two purposes: it is the long-term idempotency ledger, and it is the
durable business outcome for a later DynamoDB Streams relay.

## Atomic reservation and idempotency

Duplicate product lines are aggregated before persistence. A successful reservation uses one
`TransactWriteCommand` containing one conditional update per distinct product and one conditional
reservation record Put. Every stock update requires the item and `availableQuantity` to exist and
requires sufficient quantity before atomically subtracting stock. All updates use the same
`processedAt` timestamp. The reservation Put requires `attribute_not_exists(eventId)`.

The canonical event ID is also the stable DynamoDB `ClientRequestToken`. A consistent pre-read
avoids unnecessary duplicate transactions, while the conditional reservation Put remains the race
condition guard. If another consumer wins the race, the repository re-reads and returns the
original durable outcome, including its original timestamp; stock is never decremented twice.

DynamoDB supports at most 100 actions in one transaction. One action is reserved for the outcome
record, so this coursework implementation accepts at most 99 distinct products in one order and
rejects larger requests before sending an invalid transaction.

## Business rejection versus retryable failure

An inventory existence or sufficient-quantity condition failure cancels the entire stock
transaction. No partial decrement remains. Ordered DynamoDB cancellation reasons are then used to
identify only the expected inventory condition failures, and a conditional `REJECTED` outcome is
stored. A completed rejection is a successful SQS message because it is a durable business
decision.

Transaction conflicts, throttling, validation failures, missing cancellation metadata, and other
unexpected AWS failures propagate to the batch handler. They remain retryable through SQS. The
implementation does not classify failures by exception-message text.

## Partial SQS batches

Each SQS record is parsed and processed independently. Malformed JSON, invalid EventBridge
envelopes, invalid canonical events, or transient persistence failures add that record's SQS
`messageId` to `batchItemFailures`. Successful reservations, durable rejections, and duplicate
deliveries do not. Processing continues after an individual record fails.

Task 011 infrastructure must enable `ReportBatchItemFailures` on the future SQS event source
mapping. Without that setting, Lambda will not honor the handler's partial-batch response.

## Reliable outcome publication

Task 010 deliberately does not publish `InventoryReserved` or `InventoryRejected` directly. A
write followed by EventBridge publication would introduce another dual-write consistency gap. The
intended later flow is:

```text
Inventory Reservations table stream
  -> future Inventory outcome relay Lambda
  -> EventBridge
  -> future Order and Notification consumers
```

## Runtime configuration

The production handler requires:

```text
INVENTORY_TABLE_NAME
INVENTORY_RESERVATIONS_TABLE_NAME
```

Production composition creates one `DynamoDBDocumentClient` per Lambda execution environment with
`removeUndefinedValues: true`; it does not construct a client per message. The SDK selects its
region and credentials through the normal Lambda runtime provider chain.

Run local checks from the repository root:

```bash
npm --workspace @smartretailx/inventory-service run typecheck
npm --workspace @smartretailx/inventory-service run build
npm --workspace @smartretailx/inventory-service test
```

Tests use injected clocks, repositories, and document-client mocks. They do not contact AWS or
require credentials. This Lambda-only service has no Docker requirement.
