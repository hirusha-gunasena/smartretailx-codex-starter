# AWS Cost Guardrails

Before infrastructure work:

- Enable Cost Explorer.
- Create AWS Budgets notifications.
- Configure a billing alarm in `us-east-1`.
- Tag every resource.

Potentially chargeable components:

- NAT gateways
- Application Load Balancers
- ECS Fargate tasks
- Route 53 hosted zones and domains
- CloudFront/WAF traffic
- Customer-managed KMS keys
- Cross-region replication

Development defaults:

- Keep ECS desired count low until HA testing.
- Avoid always-on secondary-region compute until DR demonstration.
- Destroy ALB/NAT/Fargate resources after demonstrations when permitted.
- Use DynamoDB on-demand mode for low traffic.
- Use short CloudWatch log retention in development.

## Task024 Order service development guardrails

- The proposed development service has desired count `1` and CPU target-tracking autoscaling bounded
  to `1`-`2` tasks (256 CPU units and 512 MiB per task).
- The VPC has two public subnets and zero NAT Gateways. Each task receives a public IPv4 address for
  outbound ECR/AWS endpoint access, while security groups block public task ingress.
- The internal ALB, continuously running Fargate task, public IPv4 address, API Gateway requests,
  ECR storage/scanning, CloudWatch Logs, and autoscaling metrics can incur recurring or usage-based
  charges. Seven-day log retention and a maximum of ten ECR images bound development storage.
- Task024 adds no RDS, Aurora, EC2 instance, OpenSearch, MSK, Network Firewall, Transit Gateway,
  Route 53, CloudFront, ACM certificate, customer-managed KMS key, Secrets Manager resource, or S3
  access-log bucket.
- After a later approved demonstration, review stack-specific teardown of the Order service and
  registry. Preserve required evidence and data, obtain explicit approval, and account for the ECR
  repository needing to be empty before stack deletion. Task024 performs no teardown or deployment.

## Task025 ownership access-pattern guardrails

- The one `customerId-createdAt-index` GSI inherits the existing Orders GlobalTable on-demand
  billing characteristics. It adds index storage and write/read request costs when deployed; it has
  not been deployed by Task025.
- `ALL` projection is intentional for the small coursework Order representation so a customer list
  does not require a read per returned item. Customer listing uses Query rather than a full-table
  Scan; admin listing retains Scan and should remain an exceptional low-volume operation.
- A future gate must deploy only the reviewed GSI update, wait for its backfill and verify
  `IndexStatus=ACTIVE` before running the ECS service. Task025 creates no chargeable AWS resources.
