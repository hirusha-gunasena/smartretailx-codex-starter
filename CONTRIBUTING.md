# Contributing Workflow

1. Create a branch for one bounded task.
2. Keep commits small and descriptive.
3. Add tests with every behavior change.
4. Run all repository checks.
5. Review infrastructure diffs before deployment.
6. Update relevant documentation and evidence.

Suggested commit format:

```text
feat(catalogue): add product creation handler
test(inventory): cover duplicate order events
infra(order): add fargate service and alb
fix(auth): enforce administrator group on product writes
```
