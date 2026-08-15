import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { OrderRegistryStack } from '../lib/order-registry-stack.js';

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new OrderRegistryStack(app, 'TestOrderRegistryStack', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
  });
  template = Template.fromStack(stack);
});

test('creates exactly one private ECR repository with immutable scanned images', () => {
  template.resourceCountIs('AWS::ECR::Repository', 1);
  template.hasResourceProperties('AWS::ECR::Repository', {
    RepositoryName: 'smartretailx-order-service-dev',
    ImageScanningConfiguration: { ScanOnPush: true },
    ImageTagMutability: 'IMMUTABLE',
  });

  const repository = Object.values(template.findResources('AWS::ECR::Repository'))[0];
  expect(repository?.Properties).not.toHaveProperty('EncryptionConfiguration');
  expect(repository?.DeletionPolicy).toBe('Delete');
});

test('expires old untagged images and bounds retained development images', () => {
  template.hasResourceProperties('AWS::ECR::Repository', {
    LifecyclePolicy: {
      LifecyclePolicyText: Match.serializedJson({
        rules: [
          {
            rulePriority: 1,
            description: 'Remove untagged development images after seven days',
            selection: {
              tagStatus: 'untagged',
              countType: 'sinceImagePushed',
              countNumber: 7,
              countUnit: 'days',
            },
            action: { type: 'expire' },
          },
          {
            rulePriority: 2,
            description: 'Retain no more than ten development images',
            selection: {
              tagStatus: 'any',
              countType: 'imageCountMoreThan',
              countNumber: 10,
            },
            action: { type: 'expire' },
          },
        ],
      }),
    },
  });
});

test('creates no compute, networking, user, secret, or customer-managed key resources', () => {
  for (const resourceType of [
    'AWS::IAM::User',
    'AWS::SecretsManager::Secret',
    'AWS::KMS::Key',
    'AWS::ECS::Cluster',
    'AWS::ECS::Service',
    'AWS::ECS::TaskDefinition',
    'AWS::ElasticLoadBalancingV2::LoadBalancer',
    'AWS::EC2::VPC',
  ]) {
    template.resourceCountIs(resourceType, 0);
  }
});

test('exports repository identity without credentials', () => {
  template.hasOutput('OrderRepositoryName', {});
  template.hasOutput('OrderRepositoryUri', {});
  expect(JSON.stringify(template.toJSON())).not.toMatch(/password|secretkey|accesskey/iu);
});
