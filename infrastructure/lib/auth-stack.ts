import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import type { WebAuthenticationConfiguration } from './environment-configuration.js';

export interface AuthStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly projectName: string;
  readonly webAuthentication: WebAuthenticationConfiguration;
}

export class AuthStack extends cdk.Stack {
  public readonly issuer: string;
  public readonly userPoolClientId: string;
  public readonly userPoolId: string;
  public readonly userPool: cognito.IUserPool;
  public readonly userPoolClient: cognito.IUserPoolClient;

  public constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const resourcePrefix = props.projectName.toLowerCase();

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${resourcePrefix}-users-${props.environmentName}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        otp: true,
        sms: false,
      },
      enableSmsRole: false,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Catalogue administrators with read and write access.',
      precedence: 0,
    });

    new cognito.CfnUserPoolGroup(this, 'CustomerGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'customer',
      description: 'Catalogue customers with read-only access.',
      precedence: 10,
    });

    const userPoolClient = userPool.addClient('WebUserPoolClient', {
      userPoolClientName: `${resourcePrefix}-web-${props.environmentName}`,
      generateSecret: false,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [props.webAuthentication.callbackUrl],
        logoutUrls: [props.webAuthentication.logoutUrl],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(7),
    });

    const domain = userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `${resourcePrefix}-${props.environmentName}-${cdk.Aws.ACCOUNT_ID}`,
      },
    });

    this.userPool = userPool;
    this.userPoolClient = userPoolClient;
    this.userPoolId = userPool.userPoolId;
    this.userPoolClientId = userPoolClient.userPoolClientId;
    this.issuer = userPool.userPoolProviderUrl;

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: domain.baseUrl(),
    });
    new cdk.CfnOutput(this, 'CognitoIssuer', {
      value: this.issuer,
    });
    new cdk.CfnOutput(this, 'OAuthCallbackUrl', {
      value: props.webAuthentication.callbackUrl,
    });
  }
}
