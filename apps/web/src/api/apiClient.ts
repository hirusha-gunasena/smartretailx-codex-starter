import { User } from 'oidc-client-ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const getAccessToken = () => {
  const oidcStorage = sessionStorage.getItem(
    `oidc.user:${import.meta.env.VITE_COGNITO_ISSUER}:${import.meta.env.VITE_COGNITO_CLIENT_ID}`,
  );
  if (!oidcStorage) return null;
  try {
    const user = User.fromStorageString(oidcStorage);
    return user.access_token;
  } catch {
    return null;
  }
};

export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = getAccessToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  headers.set('Content-Type', 'application/json');

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    let message = 'An error occurred';
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      // Ignored
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
};
