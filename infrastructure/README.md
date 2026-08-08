# SmartRetailX infrastructure

The CDK application keeps bounded workloads in separate stacks. `FoundationStack` remains the
repository scaffold, while `CatalogueStack` defines the Task 005 development infrastructure for
the Product Catalogue API.

## CatalogueStack

For the `dev` environment, the stack synthesizes:

- one API Gateway HTTP API with a single Lambda proxy integration using payload format 2.0;
- one Node.js 22 Catalogue Lambda bundled from
  `services/catalogue-service/src/handler.ts` with its workspace and AWS SDK dependencies;
- one DynamoDB Products table; and
- the Lambda execution role, a seven-day CloudWatch log group, integration permissions, and
  CloudFormation outputs.

The Lambda is deliberately not placed in a VPC. The HTTP API and DynamoDB service endpoints do not
require private networking for this baseline, and avoiding a VPC also avoids unnecessary networking
complexity and NAT Gateway cost. Private networking is a later architecture decision if a concrete
requirement emerges.

The development Products table uses `productId` as its string partition key, on-demand billing, the
Standard table class, DynamoDB-owned encryption, disabled point-in-time recovery, no indexes, and no
stream. Deletion protection is disabled and the table uses a `DESTROY` removal policy for the bounded
development environment.

The Lambda receives only `PRODUCTS_TABLE_NAME`. Its application policy is scoped to the Products
table and permits only `GetItem`, `Scan`, `PutItem`, `UpdateItem`, and `DeleteItem`; the standard
Lambda logging policy supplies CloudWatch Logs access.

The HTTP API allows the development origin `http://localhost:5173`, the `Content-Type` and
`Authorization` headers, and these routes:

| Method | Route                          |
| ------ | ------------------------------ |
| GET    | `/api/v1/products`             |
| POST   | `/api/v1/products`             |
| GET    | `/api/v1/products/{productId}` |
| PATCH  | `/api/v1/products/{productId}` |
| DELETE | `/api/v1/products/{productId}` |

## Review commands

From the repository root, synthesize without deploying:

```bash
npm run cdk:synth
```

Inspect the local change set, when AWS credentials and bootstrap state are already configured:

```bash
npm run cdk:diff
```

Task 005 creates infrastructure code only. No deployment has occurred. Production hardening remains
pending: deletion protection, a `RETAIN` removal policy, point-in-time recovery, disaster-recovery
configuration, production CORS origins, authentication, X-Ray, alarms, and the later security review
for customer-managed encryption keys.
