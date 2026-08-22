# Orders PITR local review — 2026-08-21

Status: implemented locally, not deployed.

The current CDK source and synthesized `SmartRetailX-dev-OrderEvents` template enable point-in-time
recovery for the existing `smartretailx-orders-dev` table. The infrastructure assertion verifies
`PointInTimeRecoveryEnabled: true` on the existing GlobalTable replica.

The read-only live check performed after synthesis still reported `DISABLED`, which is expected
until a separately reviewed and explicitly approved OrderEvents deployment is completed. No table
setting was changed during this review.

Catalogue, Inventory, and Inventory Reservations PITR remain disabled and are outside this bounded
change. They require their own cost and deployment review.
