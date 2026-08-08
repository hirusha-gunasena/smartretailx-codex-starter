# Deployment Guide

## Safety sequence

```bash
aws sts get-caller-identity
aws configure get region
npm install
npm run build
npm run cdk:synth
npm run cdk:diff
```

Review the account, region, expected resources and cost implications before deployment.

## Deployment

Deployment must be explicit and approved:

```bash
npm run cdk:deploy
```

## Cleanup

Use stack-specific destruction only after reviewing retained data:

```bash
npm run cdk:destroy
```

DynamoDB tables, S3 buckets and retained logs may require deliberate cleanup decisions.

## Environments

- `dev`: low-cost, short log retention, removable resources
- `test`: isolated automated tests
- `prod-demo`: stable assessment demonstration, protected data where practical

Never share deployment outputs containing secrets. API URLs and public identifiers may be documented after review.
