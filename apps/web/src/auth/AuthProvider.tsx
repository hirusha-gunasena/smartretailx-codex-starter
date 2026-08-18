import React, { createContext, useContext, useEffect } from 'react';
import { AuthProvider as OidcProvider, useAuth as useOidcAuth } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';

const cognitoAuthConfig = {
  authority: import.meta.env.VITE_COGNITO_ISSUER,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirect_uri: `${window.location.origin}/auth/callback`,
  response_type: 'code',
  scope: 'openid email profile',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, '/');
    window.location.href = `${window.location.origin}/`;
  },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <OidcProvider {...cognitoAuthConfig}>
      <AuthContextBridge>{children}</AuthContextBridge>
    </OidcProvider>
  );
};

export type Role = 'customer' | 'admin' | null;

export interface SessionContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: unknown;
  role: Role;
  accessToken: string | null;
  login: () => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within AuthProvider');
  return context;
};

const AuthContextBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useOidcAuth();

  useEffect(() => {
    if (auth.error) {
      console.error('Auth Error:', auth.error);
    }
  }, [auth.error]);

  const getRole = (): Role => {
    if (!auth.user?.profile) return null;
    const groups = auth.user.profile['cognito:groups'] as string[];
    if (groups?.includes('admin')) return 'admin';
    return 'customer'; // Default role for users without explicit groups
  };

  const value: SessionContextType = {
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    user: auth.user?.profile,
    role: getRole(),
    accessToken: auth.user?.access_token || null,
    login: () => auth.signinRedirect(),
    logout: () => {
      auth.removeUser();
      const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;
      const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
      const logoutUri = `${window.location.origin}/`;

      if (cognitoDomain && clientId) {
        window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
      } else {
        window.location.href = logoutUri;
      }
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};
