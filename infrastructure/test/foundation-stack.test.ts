import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { FoundationStack } from '../lib/foundation-stack.js';

test('foundation stack synthesizes', () => {
  const app = new cdk.App();
  const stack = new FoundationStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  template.hasOutput('Status', {});
});
