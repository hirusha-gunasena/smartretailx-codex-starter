# k6 performance evidence status

`baseline_results.txt` is retained historical failure evidence. It is not a valid performance
result because it targeted a placeholder DNS name and every request failed name resolution.

The corrected scripts now:

- require an explicit deployed `BASE_URL`;
- call the real `/api/v1/products` routes;
- validate the standard API response envelope;
- optionally pass an ephemeral access token from terminal memory; and
- fail the baseline threshold if any request or check fails.

Do not replace or relabel the retained failed run. After a separately approved live baseline run,
save sanitized output as a new evidence artifact and record the exact scenario, UTC time window, and
deployed endpoint identifier without exposing credentials or account IDs.

## Valid bounded run — 2026-08-21

The `2026-08-21T061829217Z-*` artifacts record a live, read-only, authenticated run in
`ap-south-1`. The customer access token was obtained through the deployed Cognito Authorization
Code + PKCE S256 flow, validated in memory, and was not written to evidence.

- Order baseline: 5 virtual users for 30 seconds, 145 requests, 0 failed requests, p95 98.02 ms.
- Staged test: 7 minutes, 5 -> 20 -> 50 -> 5 -> 0 virtual users, with one Catalogue GET and one
  Order GET per iteration.
- Staged result: 18,310 requests at 43.51 requests/second, p95 63.52 ms, p99 114.15 ms, and one
  failed Catalogue request (0.0055%).
- AWS correlation: the single Catalogue 5xx aligned with one Catalogue Lambda throttle. Lambda
  errors were zero, Order API 4xx/5xx were zero, DynamoDB reported no read-throttle datapoints,
  and the ECS service remained at one healthy running task.
- Verdict: latency and error-rate thresholds passed. The deliberately strict `checks rate==1`
  threshold failed because that one response caused two failed checks. This is therefore valid
  performance evidence with a recorded reliability defect, not an all-green run.

The sanitized AWS telemetry is in
`2026-08-21T061829217Z-cloudwatch-summary.json`. The two report-ready figures are derived from the
k6 summary and that telemetry. No Product or Order data was created, updated, or deleted by this
test.
