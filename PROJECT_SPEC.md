# SmartRetailX Project Specification

## Objective
Deliver a working AWS distributed web application that demonstrates at least three independently deployable microservices, synchronous REST communication, asynchronous event-driven processing, secure authentication, high availability, monitoring, testing, and documented disaster recovery.

## Core user roles
- Customer
- Inventory Manager
- Administrator

## Core business workflow
1. An authenticated customer browses products.
2. The customer submits an order.
3. The Order Processing service stores the order as `PENDING`.
4. The service publishes `OrderCreated`.
5. The Inventory service consumes the event and reserves stock atomically.
6. The Inventory service publishes either `InventoryReserved` or `InventoryRejected`.
7. The Order service updates the order to `CONFIRMED` or `REJECTED`.
8. The Notification service records and sends the outcome.

## Required services
### Product Catalogue
- CRUD products
- Store product metadata in DynamoDB
- Store product images/documents in S3
- Admin-only write operations

### Order Processing
- Create and retrieve orders
- Calculate totals from trusted product data
- Simulate payment authorization
- Publish domain events
- Run as a Docker container on ECS Fargate

### Inventory Management
- Query inventory
- Consume order events
- Reserve stock safely
- Publish inventory outcome events
- Be idempotent

### Notification
- Consume order/inventory outcome events
- Publish email notifications through SNS
- Record delivery status and failures

## Non-functional requirements
- Multi-AZ primary-region design
- Warm-standby disaster-recovery design in a secondary region
- Least-privilege IAM
- Encryption in transit and at rest
- JWT-based authentication and RBAC
- Retry, DLQ and idempotency controls
- Structured logging, metrics, alarms and traces
- OpenAPI 3.0 documentation
- Unit, integration, end-to-end, security and performance tests
- Reproducible deployment through CDK/CloudFormation

## Explicit exclusions for the initial MVP
- Real payment provider charges
- EKS/Kubernetes
- Amazon MSK/Kafka
- Complex recommendation engines
- Full production active-active deployment
