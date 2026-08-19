import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack.js';
import { getWebAuthenticationConfiguration } from '../lib/environment-configuration.js';

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new AuthStack(app, 'TestAuthStack', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
    webAuthentication: getWebAuthenticationConfiguration('dev'),
    cloudFrontDomain: 'd123456789.cloudfront.net',
  });
  template = Template.fromStack(stack);
});

test('creates a secure email-based development User Pool with optional TOTP MFA', () => {
  template.resourceCountIs('AWS::Cognito::UserPool', 1);
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    AccountRecoverySetting: {
      RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
    },
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
    AutoVerifiedAttributes: ['email'],
    DeletionProtection: 'INACTIVE',
    EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    MfaConfiguration: 'OPTIONAL',
    Policies: {
      PasswordPolicy: {
        MinimumLength: 12,
        RequireLowercase: true,
        RequireNumbers: true,
        RequireSymbols: true,
        RequireUppercase: true,
      },
    },
    Schema: [
      Match.objectLike({
        Mutable: true,
        Name: 'email',
        Required: true,
      }),
    ],
    UsernameAttributes: ['email'],
    UserPoolName: 'smartretailx-users-dev',
  });

  const pools = Object.values(template.findResources('AWS::Cognito::UserPool'));
  expect(pools[0]?.DeletionPolicy).toBe('Delete');
  expect(pools[0]?.Properties).not.toHaveProperty('SmsConfiguration');
});

test('creates customer and admin groups without IAM roles', () => {
  template.resourceCountIs('AWS::Cognito::UserPoolGroup', 2);
  template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
    GroupName: 'admin',
    Precedence: 0,
  });
  template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
    GroupName: 'customer',
    Precedence: 10,
  });

  for (const group of Object.values(template.findResources('AWS::Cognito::UserPoolGroup'))) {
    expect(group.Properties).not.toHaveProperty('RoleArn');
  }
  template.resourceCountIs('AWS::IAM::Role', 1);
});

test('creates a public authorization-code client for the local web application', () => {
  template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    AccessTokenValidity: 60,
    AllowedOAuthFlows: ['code'],
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthScopes: ['openid', 'email', 'profile'],
    CallbackURLs: [
      'http://localhost:5173/auth/callback',
      'https://d123456789.cloudfront.net/auth/callback',
    ],
    ClientName: 'smartretailx-web-dev',
    EnableTokenRevocation: true,
    GenerateSecret: false,
    IdTokenValidity: 60,
    LogoutURLs: ['http://localhost:5173/', 'https://d123456789.cloudfront.net/'],
    PreventUserExistenceErrors: 'ENABLED',
    RefreshTokenValidity: 10080,
    SupportedIdentityProviders: ['COGNITO'],
    TokenValidityUnits: {
      AccessToken: 'minutes',
      IdToken: 'minutes',
      RefreshToken: 'minutes',
    },
  });

  const client = Object.values(template.findResources('AWS::Cognito::UserPoolClient'))[0];
  expect(client?.Properties).not.toHaveProperty('ClientSecret');
});

test('creates a deterministic account-qualified Cognito-owned domain', () => {
  template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
  template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
    Domain: {
      'Fn::Join': ['', ['smartretailx-dev-', { Ref: 'AWS::AccountId' }]],
    },
  });
});

test('publishes only non-secret authentication integration values', () => {
  template.hasOutput('UserPoolId', {});
  template.hasOutput('UserPoolClientId', {});
  template.hasOutput('CognitoDomain', {});
  template.hasOutput('CognitoIssuer', {});
  template.hasOutput('OAuthCallbackUrl', {
    Value: 'http://localhost:5173/auth/callback,https://d123456789.cloudfront.net/auth/callback',
  });

  expect(JSON.stringify(template.toJSON())).not.toContain('ClientSecret');
});

test('does not create unrelated or high-cost infrastructure', () => {
  for (const resourceType of [
    'AWS::Cognito::IdentityPool',
    'AWS::EC2::VPC',
    'AWS::EC2::NatGateway',
    'AWS::ECS::Service',
    'AWS::RDS::DBInstance',
    'AWS::OpenSearchService::Domain',
    'AWS::MSK::Cluster',
    'AWS::CloudFront::Distribution',
    'AWS::KMS::Key',
  ]) {
    template.resourceCountIs(resourceType, 0);
  }
});
