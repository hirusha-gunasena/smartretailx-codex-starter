# SmartRetailX controlled Saga test runbook

This runbook reproduces the live AWS Saga checks used for:

1. successful inventory reservation (`PENDING -> CONFIRMED`);
2. insufficient-inventory rejection (`PENDING -> REJECTED`); and
3. duplicate delivery/idempotency for `OrderCreated` and `InventoryReserved`.

Run commands from the repository root in PowerShell. Execute one test at a time. Keep the same
terminal open so the generated variables remain available.

## Safety rules

- Never use root or long-lived credentials stored in this repository.
- Never run `cdk deploy`, `cdk bootstrap`, or `cdk destroy` from this runbook.
- Do not create, update, or delete infrastructure or IAM policies.
- Do not invoke Lambda directly or send messages directly to SQS.
- Do not purge, receive, or delete SQS messages.
- Do not manually publish lifecycle events except for the two separately approved idempotency
  replays.
- Do not manually write Reservations or manually update an Order to a terminal status.
- Do not delete retained evidence records.
- Stop on any permission failure, conditional-write failure, unexpected terminal state, schema
  failure, non-empty failure queue/DLQ, or changed retained record.
- Never paste or print access keys, secret keys, session tokens, passwords, or MFA codes.

The only writes in the success and rejection tests are one conditional Inventory `PutItem` and one
conditional PENDING Order `PutItem`. The only mutations in the idempotency test are two separately
approved `PutEvents` calls to the existing event bus.

## 1. Terminal and repository setup

Set the profile and region without placing credentials in a file:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AwsProfileName = "smartretailx-deploy"
$SagaRegion = "ap-south-1"
$ExpectedIamUser = "smartretailx-deployer"
$ExpectedAccountId = Read-Host "Expected 12-digit AWS account ID"

$env:AWS_PROFILE = $AwsProfileName
$env:AWS_REGION = $SagaRegion
$env:AWS_DEFAULT_REGION = $SagaRegion
```

Check the CLI and ensure no static environment credentials override the profile. This prints names
only, never values:

```powershell
aws --version
aws configure list --profile $AwsProfileName
aws configure list-profiles

$StaticCredentialNames = @(
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN"
)
$PresentStaticCredentials = @(
  Get-ChildItem Env:AWS* |
    Where-Object { $_.Name -in $StaticCredentialNames } |
    Select-Object -ExpandProperty Name
)

if ($PresentStaticCredentials.Count -gt 0) {
  throw "Static AWS credential environment variables are present: $($PresentStaticCredentials -join ', ')"
}
```

Build and test the local production contracts/helpers used by the commands:

```powershell
npm run typecheck
npm run build
npm test
```

Do not continue if any command fails.

## 2. Common read-only preflight

Verify identity and region. The output redacts the account ID:

```powershell
$Identity = aws sts get-caller-identity --profile $AwsProfileName --region $SagaRegion --output json |
  ConvertFrom-Json
$ConfiguredRegion = aws configure get region --profile $AwsProfileName
$RedactedArn = $Identity.Arn.Replace($Identity.Account, "<ACCOUNT_ID_REDACTED>")

[pscustomobject]@{
  Arn = $RedactedArn
  AccountMatches = $Identity.Account -eq $ExpectedAccountId
  ExpectedUser = $Identity.Arn.EndsWith(":user/$ExpectedIamUser")
  IsRoot = $Identity.Arn.EndsWith(":root")
  Region = $ConfiguredRegion
} | Format-List

if ($Identity.Account -ne $ExpectedAccountId) { throw "Unexpected AWS account" }
if (-not $Identity.Arn.EndsWith(":user/$ExpectedIamUser")) { throw "Unexpected IAM identity" }
if ($Identity.Arn.EndsWith(":root")) { throw "Root is prohibited" }
if ($ConfiguredRegion -ne $SagaRegion) { throw "Unexpected AWS region" }
```

Verify the deployed stack baseline and confirm Catalogue is absent:

```powershell
$RequiredStacks = @(
  "SmartRetailX-dev-Foundation",
  "SmartRetailX-dev-OrderEvents",
  "SmartRetailX-dev-Inventory",
  "SmartRetailX-dev-OrderWorkflow"
)

$StackState = foreach ($StackName in $RequiredStacks) {
  $Status = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --profile $AwsProfileName `
    --region $SagaRegion `
    --query "Stacks[0].StackStatus" `
    --output text
  if ($LASTEXITCODE -ne 0) { throw "Could not read $StackName" }
  [pscustomobject]@{ Stack = $StackName; Status = $Status }
}
$StackState | Format-Table -AutoSize

if (@($StackState | Where-Object { $_.Status -ne "CREATE_COMPLETE" }).Count -gt 0) {
  throw "A required stack is not CREATE_COMPLETE"
}

$CatalogueStatuses = @(
  aws cloudformation list-stacks `
    --profile $AwsProfileName `
    --region $SagaRegion `
    --query "StackSummaries[?StackName=='SmartRetailX-dev-Catalogue'].StackStatus" `
    --output json |
    ConvertFrom-Json
)

if (@($CatalogueStatuses | Where-Object { $_ -ne "DELETE_COMPLETE" }).Count -gt 0) {
  throw "Catalogue is unexpectedly deployed"
}
```

Define reusable read-only queue and log checks:

```powershell
$SagaQueueNames = @(
  "smartretailx-order-relay-failures-dev",
  "smartretailx-order-relay-failures-dlq-dev",
  "smartretailx-inventory-orders-dev",
  "smartretailx-inventory-orders-dlq-dev",
  "smartretailx-inventory-outcome-relay-failures-dev",
  "smartretailx-inventory-outcome-relay-failures-dlq-dev",
  "smartretailx-order-workflow-dev",
  "smartretailx-order-workflow-dlq-dev"
)

$SagaLogGroups = @(
  "/aws/lambda/smartretailx-order-event-relay-dev",
  "/aws/lambda/smartretailx-inventory-consumer-dev",
  "/aws/lambda/smartretailx-inventory-outcome-relay-dev",
  "/aws/lambda/smartretailx-order-workflow-dev"
)

function Get-SagaQueueState {
  $Results = foreach ($QueueName in $SagaQueueNames) {
    $QueueUrl = aws sqs get-queue-url `
      --queue-name $QueueName `
      --profile $AwsProfileName `
      --region $SagaRegion `
      --query QueueUrl `
      --output text
    if ($LASTEXITCODE -ne 0) { throw "Could not resolve $QueueName" }

    $Attributes = aws sqs get-queue-attributes `
      --queue-url $QueueUrl `
      --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible ApproximateNumberOfMessagesDelayed `
      --profile $AwsProfileName `
      --region $SagaRegion `
      --output json |
      ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Could not read $QueueName" }

    [pscustomobject]@{
      Queue = $QueueName
      Available = [int]$Attributes.Attributes.ApproximateNumberOfMessages
      InFlight = [int]$Attributes.Attributes.ApproximateNumberOfMessagesNotVisible
      Delayed = [int]$Attributes.Attributes.ApproximateNumberOfMessagesDelayed
    }
  }

  $Results
}

function Assert-SagaQueuesEmpty {
  $State = @(Get-SagaQueueState)
  $State | Format-Table -AutoSize
  $NonEmpty = @(
    $State |
      Where-Object { $_.Available -gt 0 -or $_.InFlight -gt 0 -or $_.Delayed -gt 0 }
  )
  if ($NonEmpty.Count -gt 0) { throw "A Saga queue or DLQ is not empty" }
}

function Assert-SagaLogAccess {
  $StartTime = [DateTimeOffset]::UtcNow.AddDays(-7).ToUnixTimeMilliseconds()
  foreach ($LogGroup in $SagaLogGroups) {
    aws logs filter-log-events `
      --log-group-name $LogGroup `
      --start-time $StartTime `
      --limit 1 `
      --profile $AwsProfileName `
      --region $SagaRegion `
      --query "length(events)" `
      --output text | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Log access failed for $LogGroup" }
  }
}

function Get-SagaLogEvidence {
  param([Parameter(Mandatory)][string]$StartUtc)

  $StartTime = [DateTimeOffset]::Parse($StartUtc).ToUnixTimeMilliseconds()
  $EndTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  foreach ($LogGroup in $SagaLogGroups) {
    $Response = aws logs filter-log-events `
      --log-group-name $LogGroup `
      --start-time $StartTime `
      --end-time $EndTime `
      --limit 100 `
      --profile $AwsProfileName `
      --region $SagaRegion `
      --output json |
      ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Log evidence failed for $LogGroup" }

    $Events = @($Response.events)
    [pscustomobject]@{
      LogGroup = $LogGroup
      Starts = @($Events | Where-Object { $_.message -match "^START RequestId:" }).Count
      Ends = @($Events | Where-Object { $_.message -match "^END RequestId:" }).Count
      Reports = @($Events | Where-Object { $_.message -match "^REPORT RequestId:" }).Count
      ErrorLikeEvents = @(
        $Events |
          Where-Object { $_.message -match "(?i)(ERROR|Task timed out|Unhandled)" }
      ).Count
    }
  }
}
```

Run the common gates before every live test:

```powershell
Assert-SagaQueuesEmpty
Assert-SagaLogAccess
```

## 3. Common fixture and DynamoDB helpers

Generate a fresh, production-validated fixture. Use `SUCCESS` for stock `10`, request `2`; use
`REJECTION` for stock `1`, request `2`:

```powershell
function New-SagaFixture {
  param(
    [Parameter(Mandatory)]
    [ValidateSet("SUCCESS", "REJECTION")]
    [string]$Mode
  )

  $env:SAGA_TEST_MODE = $Mode
  try {
    $Output = @'
const { randomUUID } = require("node:crypto");

(async () => {
  const { pendingOrderSchema } = await import("./core/api-contracts/dist/index.js");
  const { inventoryItemSchema } = await import(
    "./domains/inventory/service/dist/domain/inventory-item.js"
  );
  const { createOrderCreatedEventId } = await import(
    "./domains/order/service/dist/adapters/events/dynamodb-order-stream-mapper.js"
  );

  const mode = process.env.SAGA_TEST_MODE;
  const timestamp = new Date().toISOString();
  const compactTimestamp = timestamp.replace(/[-:.]/g, "");
  const productId = randomUUID();
  const orderId = randomUUID();
  const customerId = randomUUID();
  const availableQuantity = mode === "SUCCESS" ? 10 : 1;
  const requestedQuantity = 2;

  const inventory = inventoryItemSchema.parse({
    productId,
    availableQuantity,
    updatedAt: timestamp
  });
  const order = pendingOrderSchema.parse({
    orderId,
    customerId,
    items: [{ productId, quantity: requestedQuantity, unitPrice: 10 }],
    totalAmount: 20,
    currency: "USD",
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "PENDING"
  });

  process.stdout.write(JSON.stringify({
    testRunId: "saga-" + mode.toLowerCase() + "-" + compactTimestamp + "-" + randomUUID().slice(0, 8),
    mode,
    productId,
    orderId,
    customerId,
    orderCreatedEventId: createOrderCreatedEventId(orderId),
    availableQuantity,
    requestedQuantity,
    inventory,
    order
  }));
})().catch((error) => {
  process.stderr.write(error.stack || error.message);
  process.exit(1);
});
'@ | node
    if ($LASTEXITCODE -ne 0) { throw "Fixture generation failed" }
    $Output | ConvertFrom-Json
  } finally {
    Remove-Item Env:SAGA_TEST_MODE -ErrorAction SilentlyContinue
  }
}
```

Use exact `GetItem` calls to prove generated keys are absent. Do not use Scan or Query:

```powershell
function Get-RawSagaItem {
  param(
    [Parameter(Mandatory)][string]$TableName,
    [Parameter(Mandatory)][string]$KeyName,
    [Parameter(Mandatory)][string]$KeyValue
  )

  $KeyArgument = "{0}={{S={1}}}" -f $KeyName, $KeyValue
  $Response = aws dynamodb get-item `
    --table-name $TableName `
    --key $KeyArgument `
    --consistent-read `
    --profile $AwsProfileName `
    --region $SagaRegion `
    --output json |
    ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw "GetItem failed for $TableName" }
  $Response.Item
}

function Assert-SagaKeysAbsent {
  param([Parameter(Mandatory)][object]$Fixture)

  $Inventory = Get-RawSagaItem `
    -TableName "smartretailx-inventory-dev" `
    -KeyName "productId" `
    -KeyValue $Fixture.productId
  $Order = Get-RawSagaItem `
    -TableName "smartretailx-orders-dev" `
    -KeyName "orderId" `
    -KeyValue $Fixture.orderId
  $Reservation = Get-RawSagaItem `
    -TableName "smartretailx-inventory-reservations-dev" `
    -KeyName "eventId" `
    -KeyValue $Fixture.orderCreatedEventId

  if ($null -ne $Inventory -or $null -ne $Order -or $null -ne $Reservation) {
    throw "At least one generated key already exists; generate a new fixture"
  }
}
```

Perform one approved conditional `PutItem`. This helper refuses to run unless the exact approval
phrase is entered and uses `maxAttempts: 1`:

```powershell
function Invoke-ApprovedConditionalPut {
  param(
    [Parameter(Mandatory)][string]$TableName,
    [Parameter(Mandatory)][object]$Item,
    [Parameter(Mandatory)][string]$PartitionKey,
    [Parameter(Mandatory)][string]$ApprovalPhrase
  )

  $EnteredApproval = Read-Host "Type exactly: $ApprovalPhrase"
  if ($EnteredApproval -cne $ApprovalPhrase) { throw "Mutation was not approved" }

  $env:SAGA_TABLE_NAME = $TableName
  $env:SAGA_ITEM_JSON = $Item | ConvertTo-Json -Depth 20 -Compress
  $env:SAGA_PARTITION_KEY = $PartitionKey

  try {
    $Output = @'
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

(async () => {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION, maxAttempts: 1 })
  );
  const startedAt = new Date().toISOString();
  await client.send(new PutCommand({
    TableName: process.env.SAGA_TABLE_NAME,
    Item: JSON.parse(process.env.SAGA_ITEM_JSON),
    ConditionExpression: "attribute_not_exists(" + process.env.SAGA_PARTITION_KEY + ")"
  }));
  const completedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify({ startedAt, completedAt }));
})().catch((error) => {
  process.stderr.write((error.name || "Error") + ": " + error.message);
  process.exit(1);
});
'@ | node
    if ($LASTEXITCODE -ne 0) { throw "Conditional PutItem failed; do not retry unconditionally" }
    $Output | ConvertFrom-Json
  } finally {
    Remove-Item Env:SAGA_TABLE_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:SAGA_ITEM_JSON -ErrorAction SilentlyContinue
    Remove-Item Env:SAGA_PARTITION_KEY -ErrorAction SilentlyContinue
  }
}
```

Read and validate Inventory through the production schema:

```powershell
function Get-ValidatedInventory {
  param([Parameter(Mandatory)][string]$ProductId)

  $env:SAGA_PRODUCT_ID = $ProductId
  try {
    $Output = @'
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

(async () => {
  const { inventoryItemSchema } = await import(
    "./domains/inventory/service/dist/domain/inventory-item.js"
  );
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION, maxAttempts: 2 })
  );
  const response = await client.send(new GetCommand({
    TableName: "smartretailx-inventory-dev",
    Key: { productId: process.env.SAGA_PRODUCT_ID },
    ConsistentRead: true
  }));
  process.stdout.write(JSON.stringify(inventoryItemSchema.parse(response.Item)));
})().catch((error) => {
  process.stderr.write(error.stack || error.message);
  process.exit(1);
});
'@ | node
    if ($LASTEXITCODE -ne 0) { throw "Inventory validation failed" }
    $Output | ConvertFrom-Json
  } finally {
    Remove-Item Env:SAGA_PRODUCT_ID -ErrorAction SilentlyContinue
  }
}
```

Poll only the exact Order key and validate every response with the production Order schema:

```powershell
function Wait-SagaOrder {
  param(
    [Parameter(Mandatory)][string]$OrderId,
    [Parameter(Mandatory)]
    [ValidateSet("CONFIRMED", "REJECTED")]
    [string]$ExpectedStatus
  )

  $env:SAGA_ORDER_ID = $OrderId
  $env:SAGA_EXPECTED_STATUS = $ExpectedStatus
  try {
    $Output = @'
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

(async () => {
  const { orderSchema } = await import("./core/api-contracts/dist/index.js");
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION, maxAttempts: 2 })
  );
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const response = await client.send(new GetCommand({
      TableName: "smartretailx-orders-dev",
      Key: { orderId: process.env.SAGA_ORDER_ID },
      ConsistentRead: true
    }));
    const observedAt = new Date().toISOString();
    const order = orderSchema.parse(response.Item);
    process.stderr.write(
      "poll=" + attempt + " observedAt=" + observedAt + " status=" + order.status + "\n"
    );

    if (order.status === process.env.SAGA_EXPECTED_STATUS) {
      process.stdout.write(JSON.stringify({ observedAt, order }));
      return;
    }
    if (order.status !== "PENDING") {
      throw new Error("Unexpected terminal Order status: " + order.status);
    }
    if (attempt < 40) await delay(3000);
  }

  throw new Error("Order remained PENDING after the observation timeout");
})().catch((error) => {
  process.stderr.write(error.stack || error.message);
  process.exit(1);
});
'@ | node
    if ($LASTEXITCODE -ne 0) { throw "Order observation failed" }
    $Output | ConvertFrom-Json
  } finally {
    Remove-Item Env:SAGA_ORDER_ID -ErrorAction SilentlyContinue
    Remove-Item Env:SAGA_EXPECTED_STATUS -ErrorAction SilentlyContinue
  }
}
```

Read the final Order, Inventory, and Reservation with production schemas and exact `GetItem` calls:

```powershell
function Get-ValidatedSagaState {
  param(
    [Parameter(Mandatory)][string]$OrderId,
    [Parameter(Mandatory)][string]$ProductId,
    [Parameter(Mandatory)][string]$ReservationEventId
  )

  $env:SAGA_ORDER_ID = $OrderId
  $env:SAGA_PRODUCT_ID = $ProductId
  $env:SAGA_RESERVATION_EVENT_ID = $ReservationEventId
  try {
    $Output = @'
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

(async () => {
  const { orderSchema } = await import("./core/api-contracts/dist/index.js");
  const { inventoryItemSchema } = await import(
    "./domains/inventory/service/dist/domain/inventory-item.js"
  );
  const { inventoryReservationSchema } = await import(
    "./domains/inventory/service/dist/domain/inventory-reservation.js"
  );
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION, maxAttempts: 2 })
  );

  const [orderResponse, inventoryResponse, reservationResponse] = await Promise.all([
    client.send(new GetCommand({
      TableName: "smartretailx-orders-dev",
      Key: { orderId: process.env.SAGA_ORDER_ID },
      ConsistentRead: true
    })),
    client.send(new GetCommand({
      TableName: "smartretailx-inventory-dev",
      Key: { productId: process.env.SAGA_PRODUCT_ID },
      ConsistentRead: true
    })),
    client.send(new GetCommand({
      TableName: "smartretailx-inventory-reservations-dev",
      Key: { eventId: process.env.SAGA_RESERVATION_EVENT_ID },
      ConsistentRead: true
    }))
  ]);

  process.stdout.write(JSON.stringify({
    observedAt: new Date().toISOString(),
    order: orderSchema.parse(orderResponse.Item),
    inventory: inventoryItemSchema.parse(inventoryResponse.Item),
    reservation: inventoryReservationSchema.parse(reservationResponse.Item)
  }));
})().catch((error) => {
  process.stderr.write(error.stack || error.message);
  process.exit(1);
});
'@ | node
    if ($LASTEXITCODE -ne 0) { throw "Saga state validation failed" }
    $Output | ConvertFrom-Json
  } finally {
    Remove-Item Env:SAGA_ORDER_ID -ErrorAction SilentlyContinue
    Remove-Item Env:SAGA_PRODUCT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:SAGA_RESERVATION_EVENT_ID -ErrorAction SilentlyContinue
  }
}
```

## 4. Successful reservation Saga

Generate and display fresh data:

```powershell
$SuccessFixture = New-SagaFixture -Mode SUCCESS
$SuccessFixture | ConvertTo-Json -Depth 20

Assert-SagaKeysAbsent -Fixture $SuccessFixture
Assert-SagaQueuesEmpty
Assert-SagaLogAccess
```

Expected arithmetic is `10 - 2 = 8` and the expected Order status is `CONFIRMED`.

### Mutation S1: seed Inventory

Display the exact operation and stop for approval:

```powershell
[pscustomobject]@{
  TableName = "smartretailx-inventory-dev"
  Item = $SuccessFixture.inventory
  ConditionExpression = "attribute_not_exists(productId)"
} | ConvertTo-Json -Depth 20
```

Only after approval, run:

```powershell
$SuccessInventoryWrite = Invoke-ApprovedConditionalPut `
  -TableName "smartretailx-inventory-dev" `
  -Item $SuccessFixture.inventory `
  -PartitionKey "productId" `
  -ApprovalPhrase "APPROVE SUCCESS INVENTORY SEED"
$SuccessInventoryWrite
```

Immediately verify the exact seed before inserting the Order:

```powershell
$VerifiedSuccessInventory = Get-ValidatedInventory -ProductId $SuccessFixture.productId
$VerifiedSuccessInventory | ConvertTo-Json -Depth 10

if ($VerifiedSuccessInventory.productId -ne $SuccessFixture.productId) { throw "Product ID mismatch" }
if ($VerifiedSuccessInventory.availableQuantity -ne 10) { throw "Inventory seed mismatch" }
if ($VerifiedSuccessInventory.updatedAt -ne $SuccessFixture.inventory.updatedAt) {
  throw "Inventory seed timestamp mismatch"
}
```

### Mutation S2: insert the PENDING Order

Display the exact operation and stop for a separate approval:

```powershell
[pscustomobject]@{
  TableName = "smartretailx-orders-dev"
  Item = $SuccessFixture.order
  ConditionExpression = "attribute_not_exists(orderId)"
} | ConvertTo-Json -Depth 20
```

Only after approval, run:

```powershell
$SuccessOrderWrite = Invoke-ApprovedConditionalPut `
  -TableName "smartretailx-orders-dev" `
  -Item $SuccessFixture.order `
  -PartitionKey "orderId" `
  -ApprovalPhrase "APPROVE SUCCESS PENDING ORDER"
$SuccessOrderWrite
```

Poll and validate the final state:

```powershell
$SuccessObservation = Wait-SagaOrder `
  -OrderId $SuccessFixture.orderId `
  -ExpectedStatus CONFIRMED
$SuccessObservation | ConvertTo-Json -Depth 20

$SuccessState = Get-ValidatedSagaState `
  -OrderId $SuccessFixture.orderId `
  -ProductId $SuccessFixture.productId `
  -ReservationEventId $SuccessFixture.orderCreatedEventId
$SuccessState | ConvertTo-Json -Depth 20

if ($SuccessState.order.status -ne "CONFIRMED") { throw "Order was not confirmed" }
if ($SuccessState.order.reservationId -ne $SuccessFixture.orderCreatedEventId) {
  throw "Reservation ID mismatch"
}
if ($SuccessState.reservation.outcome -ne "RESERVED") { throw "Reservation was not RESERVED" }
if ($SuccessState.inventory.availableQuantity -ne 8) { throw "Inventory arithmetic failed" }
if ($null -ne $SuccessState.order.PSObject.Properties["rejectionReason"]) {
  throw "Confirmed Order unexpectedly contains rejectionReason"
}
```

Capture log and queue evidence:

```powershell
Get-SagaLogEvidence -StartUtc $SuccessOrderWrite.startedAt | Format-Table -AutoSize
Start-Sleep -Seconds 10
Assert-SagaQueuesEmpty
```

Retain the three records. Do not delete them.

## 5. Insufficient-inventory rejection Saga

Generate and display a different fresh fixture:

```powershell
$RejectionFixture = New-SagaFixture -Mode REJECTION
$RejectionFixture | ConvertTo-Json -Depth 20

if ($RejectionFixture.requestedQuantity -le $RejectionFixture.availableQuantity) {
  throw "The rejection fixture is not intentionally insufficient"
}

Assert-SagaKeysAbsent -Fixture $RejectionFixture
Assert-SagaQueuesEmpty
Assert-SagaLogAccess
```

Production behavior is `1` available, `2` requested, literal reason `INSUFFICIENT_STOCK`, Inventory
unchanged at `1`, durable Reservation `REJECTED`, and final Order `REJECTED` without
`reservationId`.

### Mutation R1: seed insufficient Inventory

Display the exact operation and stop for approval:

```powershell
[pscustomobject]@{
  TableName = "smartretailx-inventory-dev"
  Item = $RejectionFixture.inventory
  ConditionExpression = "attribute_not_exists(productId)"
} | ConvertTo-Json -Depth 20
```

Only after approval, run:

```powershell
$RejectionInventoryWrite = Invoke-ApprovedConditionalPut `
  -TableName "smartretailx-inventory-dev" `
  -Item $RejectionFixture.inventory `
  -PartitionKey "productId" `
  -ApprovalPhrase "APPROVE REJECTION INVENTORY SEED"
$RejectionInventoryWrite
```

Immediately verify stock before Order insertion:

```powershell
$VerifiedRejectionInventory = Get-ValidatedInventory -ProductId $RejectionFixture.productId
$VerifiedRejectionInventory | ConvertTo-Json -Depth 10

if ($VerifiedRejectionInventory.availableQuantity -ne 1) { throw "Inventory seed mismatch" }
if ($VerifiedRejectionInventory.updatedAt -ne $RejectionFixture.inventory.updatedAt) {
  throw "Inventory seed timestamp mismatch"
}
```

### Mutation R2: insert the PENDING Order

Display the exact operation and stop for a separate approval:

```powershell
[pscustomobject]@{
  TableName = "smartretailx-orders-dev"
  Item = $RejectionFixture.order
  ConditionExpression = "attribute_not_exists(orderId)"
} | ConvertTo-Json -Depth 20
```

Only after approval, run:

```powershell
$RejectionOrderWrite = Invoke-ApprovedConditionalPut `
  -TableName "smartretailx-orders-dev" `
  -Item $RejectionFixture.order `
  -PartitionKey "orderId" `
  -ApprovalPhrase "APPROVE REJECTION PENDING ORDER"
$RejectionOrderWrite
```

Poll and validate the rejected state:

```powershell
$RejectionObservation = Wait-SagaOrder `
  -OrderId $RejectionFixture.orderId `
  -ExpectedStatus REJECTED
$RejectionObservation | ConvertTo-Json -Depth 20

$RejectionState = Get-ValidatedSagaState `
  -OrderId $RejectionFixture.orderId `
  -ProductId $RejectionFixture.productId `
  -ReservationEventId $RejectionFixture.orderCreatedEventId
$RejectionState | ConvertTo-Json -Depth 20

if ($RejectionState.order.status -ne "REJECTED") { throw "Order was not rejected" }
if ($RejectionState.order.rejectionReason -ne "INSUFFICIENT_STOCK") {
  throw "Order reason mismatch"
}
if ($null -ne $RejectionState.order.PSObject.Properties["reservationId"]) {
  throw "Rejected Order unexpectedly contains reservationId"
}
if ($RejectionState.reservation.outcome -ne "REJECTED") {
  throw "Reservation was not REJECTED"
}
if ($RejectionState.reservation.reason -ne "INSUFFICIENT_STOCK") {
  throw "Reservation reason mismatch"
}
if ($RejectionState.reservation.reason -ne $RejectionState.order.rejectionReason) {
  throw "Rejection reason did not propagate exactly"
}
if ($RejectionState.inventory.availableQuantity -ne 1) {
  throw "Rejected reservation changed Inventory"
}
if ($RejectionState.inventory.updatedAt -ne $RejectionFixture.inventory.updatedAt) {
  throw "Rejected transaction changed the Inventory timestamp"
}
```

Capture log and queue evidence:

```powershell
Get-SagaLogEvidence -StartUtc $RejectionOrderWrite.startedAt | Format-Table -AutoSize
Start-Sleep -Seconds 10
Assert-SagaQueuesEmpty
```

Retain the three rejection records. Do not delete them.

## 6. Duplicate delivery/idempotency test

This test reuses one retained successful Saga. It publishes two duplicate events separately. It does
not write DynamoDB directly.

Set the retained success identifiers. If the success test above ran in the same terminal, use its
fixture:

```powershell
$SuccessfulOrderId = $SuccessFixture.orderId
$SuccessfulProductId = $SuccessFixture.productId
$SuccessfulReservationEventId = $SuccessFixture.orderCreatedEventId
```

Otherwise enter the retained IDs explicitly:

```powershell
$SuccessfulOrderId = Read-Host "Retained CONFIRMED Order ID"
$SuccessfulProductId = Read-Host "Retained post-success Product ID"
$SuccessfulReservationEventId = Read-Host "Retained RESERVED Reservation event ID"
```

Snapshot and validate the retained state:

```powershell
$IdempotencyBaseline = Get-ValidatedSagaState `
  -OrderId $SuccessfulOrderId `
  -ProductId $SuccessfulProductId `
  -ReservationEventId $SuccessfulReservationEventId
$IdempotencyBaseline | ConvertTo-Json -Depth 20

if ($IdempotencyBaseline.order.status -ne "CONFIRMED") {
  throw "Idempotency baseline Order is not CONFIRMED"
}
if ($IdempotencyBaseline.reservation.outcome -ne "RESERVED") {
  throw "Idempotency baseline Reservation is not RESERVED"
}
if ($IdempotencyBaseline.order.reservationId -ne $SuccessfulReservationEventId) {
  throw "Retained reservation identity mismatch"
}

Assert-SagaQueuesEmpty
Assert-SagaLogAccess
```

Verify `events:PutEvents` authorization without modifying IAM:

```powershell
$EventBusName = "smartretailx-order-events-dev"
$EventBusArn = "arn:aws:events:${SagaRegion}:$($Identity.Account):event-bus/$EventBusName"
$Decision = aws iam simulate-principal-policy `
  --policy-source-arn $Identity.Arn `
  --action-names events:PutEvents `
  --resource-arns $EventBusArn `
  --profile $AwsProfileName `
  --region $SagaRegion `
  --query "EvaluationResults[0].EvalDecision" `
  --output text

if ($LASTEXITCODE -ne 0 -or $Decision -ne "allowed") {
  throw "PutEvents permission is not verifiably allowed; stop without modifying IAM"
}
```

Derive exact replay entries from the retained records using the production stream mappers:

```powershell
$env:SAGA_ORDER_ID = $SuccessfulOrderId
$env:SAGA_PRODUCT_ID = $SuccessfulProductId
$env:SAGA_RESERVATION_EVENT_ID = $SuccessfulReservationEventId
$env:SAGA_EVENT_BUS_NAME = $EventBusName

try {
  $ReplayPlanJson = @'
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");

(async () => {
  const { orderSchema, pendingOrderSchema } = await import(
    "./core/api-contracts/dist/index.js"
  );
  const { inventoryReservationSchema } = await import(
    "./domains/inventory/service/dist/domain/inventory-reservation.js"
  );
  const { mapOrderStreamRecord } = await import(
    "./domains/order/service/dist/adapters/events/dynamodb-order-stream-mapper.js"
  );
  const { mapInventoryOutcomeStreamRecord } = await import(
    "./domains/inventory/service/dist/adapters/events/inventory-outcome-stream-mapper.js"
  );
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION, maxAttempts: 2 })
  );

  const [orderResponse, reservationResponse] = await Promise.all([
    client.send(new GetCommand({
      TableName: "smartretailx-orders-dev",
      Key: { orderId: process.env.SAGA_ORDER_ID },
      ConsistentRead: true
    })),
    client.send(new GetCommand({
      TableName: "smartretailx-inventory-reservations-dev",
      Key: { eventId: process.env.SAGA_RESERVATION_EVENT_ID },
      ConsistentRead: true
    }))
  ]);

  const order = orderSchema.parse(orderResponse.Item);
  const reservation = inventoryReservationSchema.parse(reservationResponse.Item);
  if (order.status !== "CONFIRMED" || reservation.outcome !== "RESERVED") {
    throw new Error("Idempotency records do not represent a successful Saga");
  }

  const originalPendingOrder = pendingOrderSchema.parse({
    orderId: order.orderId,
    customerId: order.customerId,
    items: order.items,
    totalAmount: order.totalAmount,
    currency: order.currency,
    createdAt: order.createdAt,
    updatedAt: order.createdAt,
    status: "PENDING"
  });

  const orderCreated = mapOrderStreamRecord({
    eventName: "INSERT",
    dynamodb: { NewImage: marshall(originalPendingOrder), SequenceNumber: "plan-only" }
  });
  const inventoryReserved = mapInventoryOutcomeStreamRecord({
    eventName: "INSERT",
    dynamodb: { NewImage: marshall(reservation), SequenceNumber: "plan-only" }
  });

  if (orderCreated?.eventType !== "OrderCreated") {
    throw new Error("Could not derive OrderCreated");
  }
  if (inventoryReserved?.eventType !== "InventoryReserved") {
    throw new Error("Could not derive InventoryReserved");
  }

  process.stdout.write(JSON.stringify({
    orderCreated,
    inventoryReserved,
    orderCreatedEntry: {
      EventBusName: process.env.SAGA_EVENT_BUS_NAME,
      Source: "smartretailx.order-service",
      DetailType: orderCreated.eventType,
      Detail: JSON.stringify(orderCreated)
    },
    inventoryReservedEntry: {
      EventBusName: process.env.SAGA_EVENT_BUS_NAME,
      Source: "smartretailx.inventory-service",
      DetailType: inventoryReserved.eventType,
      Detail: JSON.stringify(inventoryReserved)
    }
  }));
})().catch((error) => {
  process.stderr.write(error.stack || error.message);
  process.exit(1);
});
'@ | node
  if ($LASTEXITCODE -ne 0) { throw "Could not derive idempotency replay plan" }
  $ReplayPlan = $ReplayPlanJson | ConvertFrom-Json
} finally {
  Remove-Item Env:SAGA_ORDER_ID -ErrorAction SilentlyContinue
  Remove-Item Env:SAGA_PRODUCT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:SAGA_RESERVATION_EVENT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:SAGA_EVENT_BUS_NAME -ErrorAction SilentlyContinue
}
```

Define the single-entry, approval-gated publisher:

```powershell
function Invoke-ApprovedEventReplay {
  param(
    [Parameter(Mandatory)][object]$Entry,
    [Parameter(Mandatory)][string]$ApprovalPhrase
  )

  $Entry | ConvertTo-Json -Depth 30
  $EnteredApproval = Read-Host "Type exactly: $ApprovalPhrase"
  if ($EnteredApproval -cne $ApprovalPhrase) { throw "Replay was not approved" }

  $env:SAGA_EVENT_ENTRY_JSON = $Entry | ConvertTo-Json -Depth 30 -Compress
  try {
    $Output = @'
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");

(async () => {
  const client = new EventBridgeClient({ region: process.env.AWS_REGION, maxAttempts: 1 });
  const startedAt = new Date().toISOString();
  const response = await client.send(new PutEventsCommand({
    Entries: [JSON.parse(process.env.SAGA_EVENT_ENTRY_JSON)]
  }));
  const completedAt = new Date().toISOString();
  const entry = response.Entries?.[0];
  if (
    (response.FailedEntryCount ?? 0) !== 0 ||
    entry === undefined ||
    entry.ErrorCode !== undefined
  ) {
    throw new Error(entry?.ErrorCode || "UNKNOWN_EVENTBRIDGE_FAILURE");
  }
  process.stdout.write(JSON.stringify({ startedAt, completedAt, failedEntryCount: 0 }));
})().catch((error) => {
  process.stderr.write((error.name || "Error") + ": " + error.message);
  process.exit(1);
});
'@ | node
    if ($LASTEXITCODE -ne 0) { throw "Event replay failed; do not retry automatically" }
    $Output | ConvertFrom-Json
  } finally {
    Remove-Item Env:SAGA_EVENT_ENTRY_JSON -ErrorAction SilentlyContinue
  }
}
```

### Mutation I1: duplicate `OrderCreated`

Display the exact event and entry, then stop for approval:

```powershell
$ReplayPlan.orderCreated | ConvertTo-Json -Depth 30
$ReplayPlan.orderCreatedEntry | ConvertTo-Json -Depth 30
```

Only after approval, publish exactly one entry:

```powershell
$OrderCreatedReplay = Invoke-ApprovedEventReplay `
  -Entry $ReplayPlan.orderCreatedEntry `
  -ApprovalPhrase "APPROVE DUPLICATE ORDERCREATED REPLAY"
$OrderCreatedReplay
```

Allow processing, then prove Inventory, Reservation, and Order did not change:

```powershell
Start-Sleep -Seconds 10
$AfterOrderCreatedReplay = Get-ValidatedSagaState `
  -OrderId $SuccessfulOrderId `
  -ProductId $SuccessfulProductId `
  -ReservationEventId $SuccessfulReservationEventId

if ($AfterOrderCreatedReplay.inventory.availableQuantity -ne $IdempotencyBaseline.inventory.availableQuantity) {
  throw "Duplicate OrderCreated decremented Inventory"
}
if ($AfterOrderCreatedReplay.inventory.updatedAt -ne $IdempotencyBaseline.inventory.updatedAt) {
  throw "Duplicate OrderCreated changed Inventory timestamp"
}
if ($AfterOrderCreatedReplay.reservation.processedAt -ne $IdempotencyBaseline.reservation.processedAt) {
  throw "Duplicate OrderCreated rewrote the Reservation"
}
if ($AfterOrderCreatedReplay.order.updatedAt -ne $IdempotencyBaseline.order.updatedAt) {
  throw "Duplicate OrderCreated changed the Order"
}

Get-SagaLogEvidence -StartUtc $OrderCreatedReplay.startedAt | Format-Table -AutoSize
Assert-SagaQueuesEmpty
```

Expected logs: one Inventory consumer invocation, with no outcome-relay, workflow, or Order-relay
invocation.

### Mutation I2: duplicate `InventoryReserved`

Display the exact event and entry, then stop for a separate approval:

```powershell
$ReplayPlan.inventoryReserved | ConvertTo-Json -Depth 30
$ReplayPlan.inventoryReservedEntry | ConvertTo-Json -Depth 30
```

Only after approval, publish exactly one entry:

```powershell
$InventoryReservedReplay = Invoke-ApprovedEventReplay `
  -Entry $ReplayPlan.inventoryReservedEntry `
  -ApprovalPhrase "APPROVE DUPLICATE INVENTORYRESERVED REPLAY"
$InventoryReservedReplay
```

Allow processing and prove OrderWorkflow did not rewrite the terminal Order:

```powershell
Start-Sleep -Seconds 10
$AfterInventoryReservedReplay = Get-ValidatedSagaState `
  -OrderId $SuccessfulOrderId `
  -ProductId $SuccessfulProductId `
  -ReservationEventId $SuccessfulReservationEventId

if ($AfterInventoryReservedReplay.order.status -ne "CONFIRMED") {
  throw "Duplicate InventoryReserved changed Order status"
}
if ($AfterInventoryReservedReplay.order.reservationId -ne $IdempotencyBaseline.order.reservationId) {
  throw "Duplicate InventoryReserved changed reservationId"
}
if ($AfterInventoryReservedReplay.order.updatedAt -ne $IdempotencyBaseline.order.updatedAt) {
  throw "Duplicate InventoryReserved rewrote the Order"
}
if ($AfterInventoryReservedReplay.inventory.updatedAt -ne $IdempotencyBaseline.inventory.updatedAt) {
  throw "Duplicate InventoryReserved changed Inventory"
}
if ($AfterInventoryReservedReplay.reservation.processedAt -ne $IdempotencyBaseline.reservation.processedAt) {
  throw "Duplicate InventoryReserved changed the Reservation"
}

Get-SagaLogEvidence -StartUtc $InventoryReservedReplay.startedAt | Format-Table -AutoSize
Assert-SagaQueuesEmpty
```

Expected logs: one OrderWorkflow invocation and no Order-relay invocation, because the matching
duplicate returns `ALREADY_APPLIED` without an Order rewrite.

## 7. Final repository and evidence checks

```powershell
git diff --check
git status --short
```

Report any pre-existing untracked files accurately. Do not claim the worktree is clean when it is
not. Do not save raw AWS responses containing account identifiers into tracked files.

For each test, report:

- redacted identity, non-root confirmation, region, and stack health;
- exact generated or retained IDs;
- exact approved mutations and their timestamps;
- initial and final Order, Inventory, and Reservation business fields;
- schema-validation results and inventory arithmetic;
- Lambda invocation evidence and observability limitations;
- final state of all eight queues;
- unexpected errors or retries;
- retained evidence IDs; and
- a clear PASS/FAIL verdict.

The current Lambdas emit mostly generic invocation logs. A terminal database transition can be
proven from DynamoDB state and relay invocation timing, but the exact outbound EventBridge payload
is not independently durable or observable without additional infrastructure. Do not create that
infrastructure during these tests.
