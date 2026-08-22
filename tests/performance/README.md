# Performance tests

These k6 scenarios issue read-only requests to the deployed Catalogue API. They do not create,
update, or delete Products. `BASE_URL` is mandatory so a placeholder hostname can never be tested by
accident. `AUTH_TOKEN` is optional for the public GET routes; if supplied, it must be a fresh
ephemeral access token and must remain only in the terminal environment.

The list request uses the deployed `/api/v1/products` route and validates the standard `{ data: [] }`
success envelope. Set `PRODUCT_ID` only when a known live Product should also be read. When it is
omitted and the list is non-empty, the first returned Product is used for the detail read.

PowerShell baseline example:

```powershell
$env:BASE_URL="https://REPLACE_WITH_THE_DEPLOYED_API_ENDPOINT"
$env:AUTH_TOKEN="REPLACE_WITH_A_FRESH_EPHEMERAL_ACCESS_TOKEN"
$env:PRODUCT_ID=""
k6 run tests/performance/baseline.js
```

Clear ephemeral values when finished:

```powershell
Remove-Item Env:AUTH_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:PRODUCT_ID -ErrorAction SilentlyContinue
Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
```

Baseline, normal-load, stress, and spike runs generate live traffic and must be separately approved
before execution. Capture sanitized output in `evidence/09-performance-k6/` without tokens, account
IDs, authorization headers, or user information. Never overwrite retained failure evidence.

`report_read_only.js` is the bounded report-evidence scenario. It exercises only authenticated
Catalogue and Order list `GET` routes, peaks at 50 virtual users, and includes warm-up, sustained
load, higher concurrency, and recovery stages. It requires `ORDER_BASE_URL` as well as the common
Catalogue variables and deliberately performs no application-data mutation.

`order_baseline.js` provides the corresponding five-VU Order success-path baseline. For a retained
demo identity without a Catalogue group, the staged script may be run with
`CATALOGUE_EXPECTED_STATUS=403`; that verifies the RBAC-denial path while the Order route remains the
authenticated data-path measurement. Reports must disclose this limitation and must not present the
Catalogue denial as a successful Catalogue read load test.
