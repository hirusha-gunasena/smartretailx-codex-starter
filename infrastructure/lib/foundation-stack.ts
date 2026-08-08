import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class FoundationStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new cdk.CfnOutput(this, 'Status', {
      value: 'Repository scaffold ready. Implement bounded stacks from CODEX_TASKS.md.',
    });
  }
}
