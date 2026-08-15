import { createHash } from 'node:crypto';

export const UUID_V5_DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
export const UUID_V5_URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const createUuidV5 = (name: string, namespace: string): string => {
  if (!UUID_PATTERN.test(namespace)) {
    throw new Error('A valid UUID namespace is required.');
  }

  const namespaceBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const digest = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();

  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;

  const hexadecimal = digest.subarray(0, 16).toString('hex');
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join('-');
};
