export interface WebAuthenticationConfiguration {
  readonly applicationUrl: string;
  readonly callbackUrl: string;
  readonly logoutUrl: string;
}

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
