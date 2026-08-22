# ADR 0001: Use AWS CDK with CloudFormation

## Status

Accepted

## Decision

Author infrastructure in TypeScript using AWS CDK v2. CDK synthesizes CloudFormation templates, and CloudFormation manages deployment state.

## Rationale

- AWS-only architecture
- One primary language across application and infrastructure
- Strong TypeScript support across application and infrastructure code
- Native change review through `cdk diff` and CloudFormation change sets
- No separate Terraform state backend

## Consequences

- The team must understand CDK constructs and CloudFormation behavior.
- Generated CloudFormation templates should be retained as deployment evidence when required.
- Terraform is not used in the main implementation.
