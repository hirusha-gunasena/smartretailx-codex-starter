import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartProvider';
import { createOrder } from '../api/orders';

export const Checkout: React.FC = () => {
  const { items, total, clearCart } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (items.length === 0) {
    navigate('/cart');
    return null;
  }

  const handleCheckout = async () => {
    setLoading(true);
    setError('');
    try {
      // NOTE: We do NOT send customerId here! The backend extracts it from the JWT.
      const order = await createOrder({
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.price,
        })),
        currency: items[0]?.currency || 'USD', // Assuming homogeneous currency
      });
      clearCart();
      navigate(`/orders/${order.orderId}`);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to create order');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
        <ul className="divide-y divide-gray-200 mb-6">
          {items.map((item) => (
            <li key={item.productId} className="py-3 flex justify-between">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
              </div>
              <p className="font-medium">${(item.price * item.quantity).toFixed(2)}</p>
            </li>
          ))}
        </ul>

        <div className="flex justify-between items-center pt-4 border-t mb-8">
          <span className="font-bold text-lg">Total</span>
          <span className="font-bold text-lg text-indigo-600">${total.toFixed(2)}</span>
        </div>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-6 text-sm">{error}</div>}

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors"
        >
          {loading ? 'Processing...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
};
