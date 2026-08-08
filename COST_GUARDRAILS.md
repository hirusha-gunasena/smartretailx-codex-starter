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
