# ADR 0002: TypeScript-first application stack

## Status

Accepted

## Decision

Use TypeScript for React, Lambda handlers, the Express container service, shared contracts, tests and CDK.

## Rationale

A single strongly typed language reduces context switching and allows shared event contracts while preserving service independence.

## Consequences

Build pipelines must compile TypeScript, and Lambda/container packaging must include only production dependencies and generated JavaScript.
