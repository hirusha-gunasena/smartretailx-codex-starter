# CDK template-only diff review — 2026-08-21

Scope: all ten deployed SmartRetailX development stacks in `ap-south-1`, using the currently deployed
immutable Order image full Git SHA. The final comparison used CDK `--method template`; it did not
create a CloudFormation change set or deploy a stack.

All ten stacks were healthy after the review and had zero remaining change sets.

## Intended local changes

| Stack                            | Diff                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| `SmartRetailX-dev-OrderEvents`   | Orders PITR `false -> true`; Order relay Lambda code asset |
| `SmartRetailX-dev-Inventory`     | Inventory consumer and outcome-relay Lambda code assets    |
| `SmartRetailX-dev-OrderWorkflow` | Order workflow Lambda code asset                           |

These changes contain no IAM, queue, EventBridge rule, API Gateway, Cognito, ECS, or network
configuration update.

## Zero-diff stacks

- `SmartRetailX-dev-Foundation`
- `SmartRetailX-dev-OrderRegistry`
- `SmartRetailX-dev-OrderService`

## Existing differences outside this bounded change

The all-stack review also found differences not introduced by the current working-tree patch:

- Frontend deployment asset;
- Auth Admin Lambda code asset;
- Catalogue Lambda code asset;
- Inventory API Lambda code asset; and
- Observability additions: one SNS topic, ten CloudWatch alarms, and an alarm-status dashboard
  update.

The unrelated assets require reconciliation before any broad deployment. The Observability
additions create new infrastructure and are explicitly excluded under the current safety boundary.
Deploy only specifically reviewed stacks after a fresh template-only diff and explicit approval.

## CLI note

An initial comparison used deprecated `--change-set template` syntax. This CDK version interpreted it
as automatic comparison and briefly created then removed read-only comparison change sets. No
application stack was deployed or updated, and a follow-up check confirmed zero remaining change
sets. The corrected syntax is `--method template`.
