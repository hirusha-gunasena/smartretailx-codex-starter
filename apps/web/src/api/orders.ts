import { fetchWithAuth } from './apiClient';

const API_URL = import.meta.env.VITE_ORDER_API_URL;

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderBody {
  items: OrderItem[];
  currency: string;
}

export interface Order {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  reservationId?: string;
  rejectionReason?: string;
}

export const getOrders = (): Promise<Order[]> => {
  return fetchWithAuth(`${API_URL}/api/v1/orders`);
};

export const getOrder = (id: string): Promise<Order> => {
  return fetchWithAuth(`${API_URL}/api/v1/orders/${id}`);
};

export const createOrder = (body: CreateOrderBody): Promise<Order> => {
  return fetchWithAuth(`${API_URL}/api/v1/orders`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
};
