export interface OrderImageRepositoryConfiguration {
  readonly imageScanningConfiguration?: {
    readonly scanOnPush?: boolean;
  };
  readonly imageTagMutability?: string;
  readonly repositoryName?: string;
}

export interface OrderImageScanResult {
  readonly imageScanFindings?: {
    readonly findingSeverityCounts?: Readonly<Record<string, number>>;
  };
  readonly imageScanStatus?: {
    readonly status?: string;
  };
}

interface ImageIndexDescriptor {
  readonly digest?: string;
  readonly platform?: {
    readonly architecture?: string;
    readonly os?: string;
  };
}

interface ImageIndexManifest {
  readonly manifests?: readonly ImageIndexDescriptor[];
}

const FULL_GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export const assertFullGitShaImageTag = (imageTag: string): void => {
  if (!FULL_GIT_SHA_PATTERN.test(imageTag)) {
    throw new Error('Order image tag must be a lowercase full 40-character Git SHA.');
  }
};

export const assertOrderImageRepositoryConfiguration = (
  repository: OrderImageRepositoryConfiguration,
  expectedRepositoryName: string,
): void => {
  if (repository.repositoryName !== expectedRepositoryName) {
    throw new Error(`Order image repository '${expectedRepositoryName}' was not found.`);
  }
  if (repository.imageTagMutability !== 'IMMUTABLE') {
    throw new Error('Order image repository must enforce immutable tags.');
  }
  if (repository.imageScanningConfiguration?.scanOnPush !== true) {
    throw new Error('Order image repository must scan images on push.');
  }
};

export const selectLinuxAmd64ImageDigest = (serializedManifest: string): string => {
  let manifest: ImageIndexManifest;
  try {
    manifest = JSON.parse(serializedManifest) as ImageIndexManifest;
  } catch {
    throw new Error('Order image index manifest is not valid JSON.');
  }

  const runtimeDescriptor = manifest.manifests?.find(
    (descriptor) =>
      descriptor.platform?.os === 'linux' && descriptor.platform.architecture === 'amd64',
  );
  const digest = runtimeDescriptor?.digest;
  if (digest === undefined || !SHA256_DIGEST_PATTERN.test(digest)) {
    throw new Error('Order image index does not contain a valid linux/amd64 runtime digest.');
  }
  return digest;
};

export const assertOrderImageScanPassed = (scan: OrderImageScanResult): void => {
  if (scan.imageScanStatus?.status !== 'COMPLETE') {
    throw new Error('Order image vulnerability scan is not complete.');
  }

  const counts = scan.imageScanFindings?.findingSeverityCounts ?? {};
  if ((counts.CRITICAL ?? 0) > 0 || (counts.HIGH ?? 0) > 0) {
    throw new Error('Order image vulnerability scan contains critical or high findings.');
  }
};
