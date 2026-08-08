# Security Policy and Engineering Requirements

## Secrets
- Never commit credentials, keys, tokens, passwords, private certificates or real `.env` files.
- Use Secrets Manager for runtime secrets.
- Use IAM roles for AWS service access.
- Rotate any credential that is exposed accidentally.

## Identity
- Cognito provides authentication.
- JWTs are validated at API Gateway where possible.
- Authorization is enforced again in business logic for sensitive operations.

## IAM
- Grant actions only on required resources.
- Separate Lambda execution roles, ECS task roles and deployment roles.
- Avoid broad managed policies in final stacks.

## Data
- Encrypt DynamoDB, S3, queues and logs at rest.
- Require TLS in transit.
- Avoid storing payment-card data; the payment integration is simulated.
- Minimize personal data and define retention policies.

## Reporting
Do not create public security issues containing secrets or exploitable production details. Record academic security findings in the private project evidence directory.
