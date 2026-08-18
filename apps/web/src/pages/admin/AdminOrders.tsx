import React, { useEffect, useState } from 'react';
import type { Order } from '../../api/orders';
import { getOrders } from '../../api/orders';

export const AdminOrders: React.FC = () => {
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
        Loading all orders...
      </div>
    );
  if (error)
    return (
      <div className="text-center text-red-600 py-20 text-sm">Error: {error}</div>
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
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">All Orders</h1>
          <p className="text-sm text-gray-500 mt-2">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="border border-gray-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Order ID</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Customer ID</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order.orderId} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-xs font-mono text-gray-400">
                    {order.orderId.substring(0, 8)}...
                  </td>
                  <td className="p-4 text-xs font-mono text-gray-400">
                    {order.customerId.substring(0, 8)}...
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${statusStyle(order.status)}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 font-semibold text-sm text-gray-900">
                    ${order.totalAmount.toFixed(2)} {order.currency}
                  </td>
                  <td className="p-4 text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
