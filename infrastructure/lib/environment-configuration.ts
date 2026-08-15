export interface WebAuthenticationConfiguration {
  readonly applicationUrl: string;
  readonly callbackUrl: string;
  readonly logoutUrl: string;
}

export const ORDER_IMAGE_TAG_PLACEHOLDER = 'task024-local-placeholder';

export interface OrderImageConfiguration {
  readonly imageTag: string;
  readonly usesPlaceholder: boolean;
}

const IMAGE_TAG_PATTERN = /^[\w][\w.-]{0,127}$/u;

const developmentWebAuthenticationConfiguration: WebAuthenticationConfiguration = {
  applicationUrl: 'http://localhost:5173',
  callbackUrl: 'http://localhost:5173/auth/callback',
  logoutUrl: 'http://localhost:5173/',
};

export const getWebAuthenticationConfiguration = (
  environmentName: string,
): WebAuthenticationConfiguration => {
  if (environmentName === 'dev') {
    return developmentWebAuthenticationConfiguration;
  }

  throw new Error(`No web authentication configuration exists for '${environmentName}'.`);
};

export const getOrderImageConfiguration = (
  configuredImageTag: unknown,
): OrderImageConfiguration => {
  const imageTag =
    configuredImageTag === undefined ? ORDER_IMAGE_TAG_PLACEHOLDER : configuredImageTag;

  if (typeof imageTag !== 'string' || !IMAGE_TAG_PATTERN.test(imageTag)) {
    throw new Error('orderImageTag must be a valid non-empty container image tag.');
  }

  if (imageTag.toLowerCase() === 'latest') {
    throw new Error("orderImageTag must be immutable and cannot be 'latest'.");
  }

  return {
    imageTag,
    usesPlaceholder: imageTag === ORDER_IMAGE_TAG_PLACEHOLDER,
  };
};
