# Codex Prompt Templates

## Feature implementation
```text
Read AGENTS.md, PROJECT_SPEC.md and ARCHITECTURE.md.
Implement Task <ID> from CODEX_TASKS.md.
Do not work outside the stated scope.
Before editing, list the files you expect to change.
Add tests and run all relevant checks.
Do not deploy AWS resources.
At the end, report changed files, test results, remaining risks and the next bounded task.
```

## Infrastructure task
```text
Read AGENTS.md and the architecture documents.
Implement only the requested AWS CDK stack or construct.
Use least privilege, encryption, deletion protection where appropriate, resource tags and low-cost development defaults.
Add CDK assertion tests.
Run cdk synth and report the generated resources.
Run cdk diff only when AWS context is available.
Do not run cdk deploy.
```

## Bug fix
```text
Reproduce the reported issue first and add a failing regression test.
Make the smallest fix that satisfies the test.
Run format, lint, typecheck and affected tests.
Do not refactor unrelated code.
```

## Review
```text
Review this change against AGENTS.md, PROJECT_SPEC.md, SECURITY.md and TEST_STRATEGY.md.
Prioritize correctness, IAM scope, secret exposure, idempotency, error handling, observability and missing tests.
Return findings ordered by severity with file and line references.
```
