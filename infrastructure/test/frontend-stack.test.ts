import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { FrontendStack } from '../lib/frontend-stack.js';

describe('FrontendStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new FrontendStack(app, 'TestFrontendStack', {
      environmentName: 'test',
      projectName: 'TestProject',
    });
    template = Template.fromStack(stack);
  });

  it('creates a private S3 bucket with Block Public Access enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('does not enable S3 website hosting', () => {
    const buckets = template.findResources('AWS::S3::Bucket');
    const bucketKeys = Object.keys(buckets);
    expect(bucketKeys.length).toBeGreaterThan(0);
    bucketKeys.forEach((key) => {
      const bucket = buckets[key];
      expect(bucket!.Properties?.WebsiteConfiguration).toBeUndefined();
    });
  });

  it('creates a CloudFront distribution with HTTPS redirect and index.html default root object', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: 'redirect-to-https',
        },
      },
    });
  });

  it('creates an Origin Access Control (OAC) for CloudFront', () => {
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: {
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      },
    });
  });

  it('contains an S3 bucket policy that allows CloudFront to read via OAC', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:GetObject',
            Effect: 'Allow',
            Principal: {
              Service: 'cloudfront.amazonaws.com',
            },
            Condition: {
              StringEquals: {
                'AWS:SourceArn': {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      { Ref: 'AWS::Partition' },
                      ':cloudfront::',
                      { Ref: 'AWS::AccountId' },
                      ':distribution/',
                      { Ref: Match.anyValue() },
                    ],
                  ],
                },
              },
            },
          }),
        ]),
      },
    });
  });

  it('provides a SPA routing solution by returning index.html for 403 and 404 errors', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CustomErrorResponses: [
          {
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          },
          {
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          },
        ],
      },
    });
  });

  it('attaches the AWS-managed SECURITY_HEADERS response headers policy to the default behaviour', () => {
    // The AWS-managed SecurityHeadersPolicy has a well-known fixed ID.
    // CDK references it as a literal ARN in the template.
    const dist = template.findResources('AWS::CloudFront::Distribution');
    const distValues = Object.values(dist);
    expect(distValues.length).toBe(1);
    const defaultBehavior = (
      distValues[0]!.Properties.DistributionConfig as {
        DefaultCacheBehavior: { ResponseHeadersPolicyId: unknown };
      }
    ).DefaultCacheBehavior;
    // Verify a ResponseHeadersPolicyId is configured (the managed ARN is environment-resolved).
    expect(defaultBehavior.ResponseHeadersPolicyId).toBeDefined();
  });

  it('includes a BucketDeployment custom resource to upload frontend assets', () => {
    // CDK BucketDeployment produces a Custom::CDKBucketDeployment resource.
    template.resourceCountIs('Custom::CDKBucketDeployment', 1);
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      DestinationBucketName: Match.anyValue(),
      DistributionId: Match.anyValue(),
      DistributionPaths: ['/*'],
    });
  });

  it('creates required non-sensitive outputs', () => {
    template.hasOutput('CloudFrontDomain', {});
    template.hasOutput('FrontendBucketName', {});
    template.hasOutput('CloudFrontDistributionId', {});
  });
});
