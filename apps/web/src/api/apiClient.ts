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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any; // Justified: Response payload can be of any shape (object, array, primitive)
  try {
    body = await response.json();
  } catch {
    // Ignored
  }

  if (!response.ok) {
    const message = body?.error?.message || body?.message || 'An error occurred';
    throw new ApiError(response.status, message);
  }

  return body && typeof body === 'object' && 'data' in body ? body.data : body;
};
