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

export const updateProduct = (id: string, updates: Partial<Product>): Promise<Product> => {
  return fetchWithAuth(`${API_URL}/api/v1/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

export const deleteProduct = (id: string): Promise<void> => {
  return fetchWithAuth(`${API_URL}/api/v1/products/${id}`, {
    method: 'DELETE',
  });
};

export const getUploadUrl = (contentType: string): Promise<{ uploadUrl: string; imageUrl: string }> => {
  return fetchWithAuth(`${API_URL}/api/v1/products/upload-url`, {
    method: 'POST',
    body: JSON.stringify({ contentType }),
  });
};

export const uploadFileToS3 = async (url: string, file: File): Promise<void> => {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error('Failed to upload file to S3');
  }
};
