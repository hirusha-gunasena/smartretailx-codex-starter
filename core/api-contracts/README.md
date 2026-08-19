# API contracts

Shared runtime schemas and TypeScript types for SmartRetailX `/api/v1` product and order request
and response payloads.

This package defines transport contracts only. Catalogue and order business rules remain inside their owning services.

`CreateOrderBody` is the strict public Order create payload (`items` and `currency` only). The
existing `CreateOrderRequest` remains the internal application/domain contract with a UUID
`customerId`; the Order service derives that value from verified identity rather than accepting it
from an API caller.
