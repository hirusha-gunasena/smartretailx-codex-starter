import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';

export interface OrderRegistryStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly projectName: string;
}

export class OrderRegistryStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  public constructor(scope: Construct, id: string, props: OrderRegistryStackProps) {
    super(scope, id, props);

    const resourcePrefix = props.projectName.toLowerCase();

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    this.repository = new ecr.Repository(this, 'OrderServiceRepository', {
      repositoryName: `${resourcePrefix}-order-service-${props.environmentName}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      encryption: ecr.RepositoryEncryption.AES_256,
      lifecycleRules: [
        {
          description: 'Remove untagged development images after seven days',
          rulePriority: 1,
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: cdk.Duration.days(7),
        },
        {
          description: 'Retain no more than ten development images',
          rulePriority: 2,
          tagStatus: ecr.TagStatus.ANY,
          maxImageCount: 10,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'OrderRepositoryName', {
      value: this.repository.repositoryName,
    });
    new cdk.CfnOutput(this, 'OrderRepositoryUri', {
      value: this.repository.repositoryUri,
    });
  }
}
