# Inventory service

The Inventory service is an asynchronous-only consumer responsible for reserving stock for the
canonical `OrderCreated` event. Task 010 creates application and adapter code only; it does not
create or deploy Lambda functions, queues, EventBridge rules, DynamoDB tables, or IAM policies.

## Intended asynchronous flow

Task 011 now defines this delivery path in CDK, but it has not been deployed:

```text
Order EventBridge bus
  -> OrderCreated rule
  -> Inventory SQS queue and DLQ
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

Task 011 enables `ReportBatchItemFailures` on the SQS event source mapping. Without that setting,
Lambda would not honor the handler's partial-batch response.

## Reliable outcome publication

Task 010 continues to persist the durable Reservation outcome without publishing directly to
EventBridge. A stock write followed by `PutEvents` in that workflow would introduce a database/event
bus dual-write consistency gap. Task 012 adds the application and adapter code for this separate
reliable path:

```text
Inventory Lambda
  -> durable Inventory Reservations record
  -> [Task 013 CDK; not deployed] DynamoDB Stream NEW_IMAGE
  -> [Task 012 code + Task 013 CDK; not deployed] Inventory Outcome Relay
  -> existing SmartRetailX EventBridge bus
  -> InventoryReserved | InventoryRejected
  -> future idempotent consumers
```

Only `INSERT` records can emit outcomes; `MODIFY` and `REMOVE` are ignored in code even if future
infrastructure also filters records. Each inserted image is unmarshalled and validated with the
existing `InventoryReservation` schema before mapping. A `RESERVED` record uses its requested items
and durable `eventId` as the canonical reservation identity. A `REJECTED` record uses the stored
`INSUFFICIENT_STOCK` reason and stored insufficient-item details. Both preserve `correlationId` and
use `processedAt` as `occurredAt`, so retries do not alter workflow identity or time.

DynamoDB Streams delivery is at least once. The relay therefore derives UUID v5 event IDs in the
fixed RFC 4122 URL namespace `6ba7b811-9dad-11d1-80b4-00c04fd430c8`, using
`smartretailx:<outcome-type>:<reservation-eventId>` as the logical name. A retry of the same outcome
gets the same canonical `eventId`, while reserved and rejected identities cannot collide. Future
downstream consumers must still be idempotent by canonical event ID because EventBridge and SQS can
deliver duplicates.

Each stream record is handled independently. Mapping and publication failures return the record's
DynamoDB sequence number in `batchItemFailures`, and later records continue processing. A failed
record without a usable sequence number raises an explicit unreportable-record error rather than
inventing an identifier. Task 013 configures the DynamoDB Streams event source mapping function
response type as `ReportBatchItemFailures`; returning this application response would not be
sufficient by itself.

Task 012 creates no Reservations table stream, relay Lambda resource, event source mapping,
EventBridge rule, queue, IAM policy, or other AWS resource. Task 013 now defines the stream, relay
Lambda, mapping, least-privilege permissions, and a dedicated on-failure queue with a terminal DLQ.
The SQS on-failure destination contains Lambda invocation and failure metadata rather than the full
original DynamoDB stream payload; S3 is the AWS alternative when complete original invocation
retention is required. Nothing described here has been deployed, and downstream Order and
Notification consumers remain deferred.

## Runtime configuration

The production handler requires:

```text
INVENTORY_TABLE_NAME
INVENTORY_RESERVATIONS_TABLE_NAME
```

The separate Inventory outcome relay production entry point requires:

```text
INVENTORY_EVENT_BUS_NAME
```

This relay-only variable is read by relay composition and is not required by the existing Inventory
SQS consumer or its tests. Relay composition creates one `EventBridgeClient` per Lambda execution
environment and reuses it for all records.

Production composition creates one `DynamoDBDocumentClient` per Lambda execution environment with
`removeUndefinedValues: true`; it does not construct a client per message. The SDK selects its
region and credentials through the normal Lambda runtime provider chain.

Run local checks from the repository root:

```bash
npm --workspace @smartretailx/inventory-service run typecheck
npm --workspace @smartretailx/inventory-service run build
npm --workspace @smartretailx/inventory-service test
```

Tests use injected clocks, repositories, document-client mocks, and EventBridge-client mocks. They
do not contact AWS or require credentials. This Lambda-only service has no Docker requirement. Task
011 adds CDK definitions only; Task 012 adds relay code only; no Inventory resources have been
deployed.
