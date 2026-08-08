import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class FoundationStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Validations.of(this).acknowledge({
      id: 'CloudFormation-Validate::F0001',
      reason: 'The foundation scaffold intentionally has no Resources section.',
    });

    new cdk.CfnOutput(this, 'Status', {
      value: 'Repository scaffold ready. Implement bounded stacks from CODEX_TASKS.md.',
    });
  }
}
