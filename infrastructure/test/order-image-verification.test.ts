import {
  assertFullGitShaImageTag,
  assertOrderImageRepositoryConfiguration,
  assertOrderImageScanPassed,
  selectLinuxAmd64ImageDigest,
} from '../lib/order-image-verification.js';

const validTag = '0123456789abcdef0123456789abcdef01234567';
const runtimeDigest = `sha256:${'a'.repeat(64)}`;

test('requires a lowercase full Git SHA image tag', () => {
  expect(() => assertFullGitShaImageTag(validTag)).not.toThrow();
  expect(() => assertFullGitShaImageTag('abc123')).toThrow(/full 40-character Git SHA/u);
  expect(() => assertFullGitShaImageTag(validTag.toUpperCase())).toThrow(
    /full 40-character Git SHA/u,
  );
});

test('requires immutable tags and scan-on-push on the expected repository', () => {
  expect(() =>
    assertOrderImageRepositoryConfiguration(
      {
        repositoryName: 'smartretailx-order-service-dev',
        imageTagMutability: 'IMMUTABLE',
        imageScanningConfiguration: { scanOnPush: true },
      },
      'smartretailx-order-service-dev',
    ),
  ).not.toThrow();
  expect(() =>
    assertOrderImageRepositoryConfiguration(
      {
        repositoryName: 'smartretailx-order-service-dev',
        imageTagMutability: 'MUTABLE',
        imageScanningConfiguration: { scanOnPush: true },
      },
      'smartretailx-order-service-dev',
    ),
  ).toThrow(/immutable/u);
});

test('selects the linux amd64 runtime child and ignores provenance metadata', () => {
  const manifest = JSON.stringify({
    manifests: [
      {
        digest: `sha256:${'b'.repeat(64)}`,
        platform: { os: 'unknown', architecture: 'unknown' },
      },
      {
        digest: runtimeDigest,
        platform: { os: 'linux', architecture: 'amd64' },
      },
    ],
  });

  expect(selectLinuxAmd64ImageDigest(manifest)).toBe(runtimeDigest);
  expect(() => selectLinuxAmd64ImageDigest('{')).toThrow(/not valid JSON/u);
});

test('accepts only completed scans without critical or high findings', () => {
  expect(() =>
    assertOrderImageScanPassed({
      imageScanStatus: { status: 'COMPLETE' },
      imageScanFindings: { findingSeverityCounts: { MEDIUM: 1 } },
    }),
  ).not.toThrow();
  expect(() => assertOrderImageScanPassed({ imageScanStatus: { status: 'IN_PROGRESS' } })).toThrow(
    /not complete/u,
  );
  expect(() =>
    assertOrderImageScanPassed({
      imageScanStatus: { status: 'COMPLETE' },
      imageScanFindings: { findingSeverityCounts: { HIGH: 1 } },
    }),
  ).toThrow(/critical or high/u);
});
