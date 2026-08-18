import { fetchWithAuth } from './apiClient';

const API_URL = import.meta.env.VITE_ADMIN_API_URL || import.meta.env.VITE_CATALOGUE_API_URL; // Fallback

export interface User {
  id: string;
  email: string;
  status: string;
  enabled: boolean;
  created: string;
}

export const getUsers = (): Promise<User[]> => {
  return fetchWithAuth(`${API_URL}/api/v1/users`);
};

export const updateUser = (username: string, updates: Partial<User>): Promise<void> => {
  return fetchWithAuth(`${API_URL}/api/v1/users/${username}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};
