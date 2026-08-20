import { fetchWithAuth } from './apiClient';

const API_URL = import.meta.env.VITE_INVENTORY_API_URL || import.meta.env.VITE_CATALOGUE_API_URL; // fallback if not set yet

export interface Inventory {
  productId: string;
  availableQuantity: number;
}

export const getInventory = (productId: string): Promise<Inventory> => {
  return fetchWithAuth(`${API_URL}/api/v1/inventory/${productId}`);
};

export const setInventory = (productId: string, quantity: number): Promise<Inventory> => {
  return fetchWithAuth(`${API_URL}/api/v1/inventory/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
};
