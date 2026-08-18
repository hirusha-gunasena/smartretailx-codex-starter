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
      const order = await createOrder({
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.price,
        })),
        currency: items[0]?.currency || 'USD',
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
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Checkout</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="border border-gray-200 bg-white">
          {/* Order Items */}
          <div className="p-8 border-b border-gray-200">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">
              Order Summary
            </h2>
            <ul className="divide-y divide-gray-100">
              {items.map((item) => (
                <li key={item.productId} className="py-4 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Qty: {item.quantity}</p>
                  </div>
                  <p className="font-semibold text-sm text-gray-900">
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Totals */}
          <div className="p-8 bg-gray-50 border-b border-gray-200">
            <div className="flex justify-between items-center mb-3 text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-semibold text-gray-900">${total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mb-3 text-sm">
              <span className="text-gray-500">Shipping</span>
              <span className="font-semibold text-gray-900">{total >= 150 ? 'Free' : '$9.99'}</span>
            </div>
            <div className="border-t border-gray-200 mt-4 pt-4 flex justify-between items-center">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-lg text-gray-900">
                ${(total + (total >= 150 ? 0 : 9.99)).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action */}
          <div className="p-8">
            {error && (
              <div className="bg-red-50 text-red-700 p-4 border border-red-200 mb-6 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full bg-black text-white py-4 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Processing...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
