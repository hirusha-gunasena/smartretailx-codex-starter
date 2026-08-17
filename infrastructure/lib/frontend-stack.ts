import * as path from 'path';
import { fileURLToPath } from 'url';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

// Resolve the monorepo root (two levels up from infrastructure/lib)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..');
const WEB_DIST_PATH = path.join(MONOREPO_ROOT, 'apps', 'web', 'dist');

export interface FrontendStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly projectName: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly cloudFrontDomain: string;

  public constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const resourcePrefix = props.projectName.toLowerCase();

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // Private S3 bucket for frontend assets — no public access, no website hosting
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${resourcePrefix}-frontend-${props.environmentName}-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // appropriate for dev environment
    });

    // CloudFront distribution with OAC, HTTPS redirect, SPA routing, and security headers.
    // AWS-managed SecurityHeadersPolicy (id: 67f7725c-6f97-4210-82d7-5512b31e9d03) adds:
    //   HSTS, X-Content-Type-Options, X-Frame-Options (SAMEORIGIN), Referrer-Policy,
    //   X-XSS-Protection — without a restrictive CSP that would break Cognito hosted UI.
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: `SmartRetailX Frontend - ${props.environmentName}`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
          frontendBucket as IBucket,
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // lower cost
    });

    this.cloudFrontDomain = distribution.distributionDomainName;

    // Deploy production frontend assets to the private S3 bucket and invalidate CloudFront.
    // PRE-REQUISITE: apps/web/dist must exist (run: npm run build --workspace apps/web)
    // before running cdk deploy for this stack.
    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset(WEB_DIST_PATH)],
      destinationBucket: frontendBucket as IBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: this.cloudFrontDomain,
    });
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
    });
  }
}
