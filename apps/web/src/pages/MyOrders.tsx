import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '../api/orders';
import { getOrders } from '../api/orders';
import { ArrowRight } from 'lucide-react';

export const MyOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getOrders()
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="text-center py-20 text-sm uppercase tracking-wider text-gray-400">
        Loading orders...
      </div>
    );
  if (error) return <div className="text-center text-red-600 py-20 text-sm">Error: {error}</div>;
  if (orders.length === 0)
    return (
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-6 py-24 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No orders yet</h2>
          <p className="text-gray-500 text-sm mb-8">
            Once you place an order, it will appear here.
          </p>
          <Link
            to="/products"
            className="inline-block bg-black text-white px-8 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );

  const statusStyle = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'REJECTED':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
    }
  };

  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">My Orders</h1>
          <p className="text-sm text-gray-500 mt-2">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="border border-gray-200 divide-y divide-gray-200">
          {orders.map((order) => (
            <Link
              key={order.orderId}
              to={`/orders/${order.orderId}`}
              className="block p-6 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                    Order #{order.orderId.substring(0, 8)}
                  </p>
                  <p className="font-bold text-gray-900 text-lg mt-1">
                    {order.totalAmount.toFixed(2)} {order.currency}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(order.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusStyle(order.status)}`}
                  >
                    {order.status}
                  </span>
                  <ArrowRight
                    className="w-4 h-4 text-gray-400 group-hover:text-gray-900 transition-colors"
                    strokeWidth={1.5}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
