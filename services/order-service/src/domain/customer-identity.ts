import { customerIdSchema } from '@smartretailx/api-contracts';
import { OrderAuthenticationError } from './authorization-errors.js';
import { UUID_V5_DNS_NAMESPACE, createUuidV5 } from './uuid-v5.js';

const CUSTOMER_NAMESPACE_NAME = 'customers.smartretailx.internal';

export const CUSTOMER_UUID_NAMESPACE = createUuidV5(CUSTOMER_NAMESPACE_NAME, UUID_V5_DNS_NAMESPACE);

export const customerIdForCognitoSubject = (subject: string): string => {
  if (subject.length === 0) {
    throw new OrderAuthenticationError('AUTH_INVALID_TOKEN');
  }

  return customerIdSchema.parse(createUuidV5(`cognito:${subject}`, CUSTOMER_UUID_NAMESPACE));
};
