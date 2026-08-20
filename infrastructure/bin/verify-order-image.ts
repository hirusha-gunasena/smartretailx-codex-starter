#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  assertFullGitShaImageTag,
  assertOrderImageRepositoryConfiguration,
  assertOrderImageScanPassed,
  selectLinuxAmd64ImageDigest,
  type OrderImageRepositoryConfiguration,
  type OrderImageScanResult,
} from '../lib/order-image-verification.js';

interface VerificationArguments {
  readonly imageTag: string;
  readonly profile: string;
  readonly region: string;
  readonly repositoryName: string;
}

interface DescribeRepositoriesResponse {
  readonly repositories?: readonly OrderImageRepositoryConfiguration[];
}

interface DescribeImagesResponse {
  readonly imageDetails?: readonly {
    readonly imageDigest?: string;
    readonly imageManifestMediaType?: string;
  }[];
}

interface BatchGetImageResponse {
  readonly images?: readonly {
    readonly imageManifest?: string;
  }[];
}

const optionValue = (arguments_: readonly string[], option: string): string | undefined => {
  const index = arguments_.indexOf(option);
  return index === -1 ? undefined : arguments_[index + 1];
};

const requiredOption = (arguments_: readonly string[], option: string): string => {
  const value = optionValue(arguments_, option)?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required ${option} option.`);
  }
  return value;
};

const parseArguments = (arguments_: readonly string[]): VerificationArguments => ({
  imageTag: requiredOption(arguments_, '--tag'),
  profile: requiredOption(arguments_, '--profile'),
  region: requiredOption(arguments_, '--region'),
  repositoryName:
    optionValue(arguments_, '--repository')?.trim() || 'smartretailx-order-service-dev',
});

const runAwsJson = <T>(
  operation: string,
  arguments_: readonly string[],
  configuration: Pick<VerificationArguments, 'profile' | 'region'>,
): T => {
  const result = spawnSync(
    'aws',
    [
      ...arguments_,
      '--profile',
      configuration.profile,
      '--region',
      configuration.region,
      '--output',
      'json',
    ],
    {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(`AWS CLI ${operation} failed; verify authentication and the requested image.`);
  }

  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`AWS CLI ${operation} did not return valid JSON.`);
  }
};

const verifyOrderImage = (arguments_: VerificationArguments): void => {
  assertFullGitShaImageTag(arguments_.imageTag);

  const repositories = runAwsJson<DescribeRepositoriesResponse>(
    'describe-repositories',
    ['ecr', 'describe-repositories', '--repository-names', arguments_.repositoryName],
    arguments_,
  );
  const repository = repositories.repositories?.[0] ?? {};
  assertOrderImageRepositoryConfiguration(repository, arguments_.repositoryName);

  const imageResponse = runAwsJson<DescribeImagesResponse>(
    'describe-images',
    [
      'ecr',
      'describe-images',
      '--repository-name',
      arguments_.repositoryName,
      '--image-ids',
      `imageTag=${arguments_.imageTag}`,
    ],
    arguments_,
  );
  const image = imageResponse.imageDetails?.[0];
  if (image?.imageDigest === undefined) {
    throw new Error('The exact Order image tag does not exist in ECR.');
  }

  let runtimeDigest = image.imageDigest;
  if (image.imageManifestMediaType === 'application/vnd.oci.image.index.v1+json') {
    const manifestResponse = runAwsJson<BatchGetImageResponse>(
      'batch-get-image',
      [
        'ecr',
        'batch-get-image',
        '--repository-name',
        arguments_.repositoryName,
        '--image-ids',
        `imageTag=${arguments_.imageTag}`,
        '--accepted-media-types',
        'application/vnd.oci.image.index.v1+json',
      ],
      arguments_,
    );
    const serializedManifest = manifestResponse.images?.[0]?.imageManifest;
    if (serializedManifest === undefined) {
      throw new Error('The Order image index manifest could not be retrieved.');
    }
    runtimeDigest = selectLinuxAmd64ImageDigest(serializedManifest);
  }

  const scan = runAwsJson<OrderImageScanResult>(
    'describe-image-scan-findings',
    [
      'ecr',
      'describe-image-scan-findings',
      '--repository-name',
      arguments_.repositoryName,
      '--image-id',
      `imageDigest=${runtimeDigest}`,
    ],
    arguments_,
  );
  assertOrderImageScanPassed(scan);

  const severityCounts = scan.imageScanFindings?.findingSeverityCounts ?? {};
  process.stdout.write(
    `${JSON.stringify({
      repository: arguments_.repositoryName,
      imageTag: arguments_.imageTag,
      imageDigest: image.imageDigest,
      runtimePlatform: 'linux/amd64',
      runtimeDigest,
      scanStatus: scan.imageScanStatus?.status,
      critical: severityCounts.CRITICAL ?? 0,
      high: severityCounts.HIGH ?? 0,
    })}\n`,
  );
};

try {
  verifyOrderImage(parseArguments(process.argv.slice(2)));
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unknown Order image verification error.';
  process.stderr.write(`Order image verification failed: ${message}\n`);
  process.exitCode = 1;
}
