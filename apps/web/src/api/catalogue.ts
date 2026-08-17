import { fetchWithAuth } from './apiClient';

const API_URL = import.meta.env.VITE_CATALOGUE_API_URL;

export interface Product {
  productId: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export const getProducts = (): Promise<Product[]> => {
  return fetchWithAuth(`${API_URL}/api/v1/products`);
};

export const getProduct = (id: string): Promise<Product> => {
  return fetchWithAuth(`${API_URL}/api/v1/products/${id}`);
};

export const createProduct = (product: Partial<Product>): Promise<Product> => {
  return fetchWithAuth(`${API_URL}/api/v1/products`, {
    method: 'POST',
    body: JSON.stringify(product),
  });
};
