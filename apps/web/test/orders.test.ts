import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrder } from '../src/api/orders';
import * as apiClient from '../src/api/apiClient';

vi.mock('../src/api/apiClient', () => ({
  fetchWithAuth: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

describe('Orders API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strictly excludes customerId from createOrder payload', async () => {
    const mockOrder = { orderId: '123', status: 'PENDING' };
    vi.mocked(apiClient.fetchWithAuth).mockResolvedValueOnce(mockOrder);

    const body = {
      items: [{ productId: 'p1', quantity: 2, unitPrice: 10 }],
      currency: 'USD',
    };

    await createOrder(body);

    expect(apiClient.fetchWithAuth).toHaveBeenCalledTimes(1);

    // Get the arguments passed to fetchWithAuth
    const args = vi.mocked(apiClient.fetchWithAuth).mock.calls[0];
    const url = args?.[0];
    const options = args?.[1] as RequestInit;

    expect(url).toContain('/api/v1/orders');
    expect(options.method).toBe('POST');

    const parsedBody = JSON.parse(options.body as string);

    // Crucial security requirement
    expect(parsedBody).not.toHaveProperty('customerId');
    expect(parsedBody).toHaveProperty('items');
    expect(parsedBody).toHaveProperty('currency');
  });
});
