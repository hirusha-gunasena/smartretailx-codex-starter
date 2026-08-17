import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '../api/orders';
import { getOrders } from '../api/orders';

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

  if (loading) return <div className="text-center py-12">Loading orders...</div>;
  if (error) return <div className="text-center text-red-600 py-12">Error: {error}</div>;
  if (orders.length === 0)
    return <div className="text-center py-12 text-gray-500">You have no orders yet.</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {orders.map((order) => (
            <li key={order.orderId} className="p-6 hover:bg-gray-50 transition-colors">
              <Link to={`/orders/${order.orderId}`} className="block">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-500">
                    Order ID: <span className="font-mono">{order.orderId}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="font-medium text-lg">
                    ${order.totalAmount.toFixed(2)} {order.currency}
                  </div>
                  <div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold
                      ${
                        order.status === 'CONFIRMED'
                          ? 'bg-green-100 text-green-800'
                          : order.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
