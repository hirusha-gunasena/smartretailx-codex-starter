import { customerIdSchema } from '@smartretailx/api-contracts';
import {
  CUSTOMER_UUID_NAMESPACE,
  OrderAuthenticationError,
  customerIdForCognitoSubject,
} from '../../src/index.js';

describe('customerIdForCognitoSubject', () => {
  test('pins the namespaced UUID v5 mapping version', () => {
    expect(CUSTOMER_UUID_NAMESPACE).toBe('1e49a40c-e66b-540b-9ba6-ca660c7c4846');
    expect(customerIdForCognitoSubject('opaque-customer-subject')).toBe(
      'e3a28252-e413-5d5b-87ac-b2e04d75a62f',
    );
  });

  test('maps the same opaque subject to the same customer UUID', () => {
    expect(customerIdForCognitoSubject('not-an-rfc-uuid')).toBe(
      customerIdForCognitoSubject('not-an-rfc-uuid'),
    );
  });

  test('maps different subjects to different customer UUIDs', () => {
    expect(customerIdForCognitoSubject('subject-a')).not.toBe(
      customerIdForCognitoSubject('subject-b'),
    );
  });

  test('produces a value accepted by the existing customerId UUID contract', () => {
    expect(customerIdSchema.safeParse(customerIdForCognitoSubject('opaque/value:42')).success).toBe(
      true,
    );
  });

  test('rejects an empty subject before identity translation', () => {
    expect(() => customerIdForCognitoSubject('')).toThrow(OrderAuthenticationError);
  });
});
