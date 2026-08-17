import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Order } from '../api/orders';
import { getOrder } from '../api/orders';
import type { Product } from '../api/catalogue';
import { getProduct } from '../api/catalogue';
import { ArrowLeft, Clock, CheckCircle, XCircle } from 'lucide-react';

export const OrderDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<Record<string, Product>>({});

  useEffect(() => {
    if (!orderId) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let pollCount = 0;
    const maxPolls = 15;

    const fetchOrder = async () => {
      try {
        const fetchedOrder = await getOrder(orderId);
        setOrder(fetchedOrder);
        setLoading(false);

        // Fetch product details for items
        const newProducts: Record<string, Product> = { ...products };
        for (const item of fetchedOrder.items) {
          if (!newProducts[item.productId]) {
            try {
              const prod = await getProduct(item.productId);
              newProducts[item.productId] = prod;
            } catch {
              // Ignore product fetch errors
            }
          }
        }
        setProducts(newProducts);

        if (fetchedOrder.status === 'PENDING' && pollCount < maxPolls) {
          pollCount++;
          timeoutId = setTimeout(fetchOrder, 3000);
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (!order) {
          // Only set error if we don't have initial data
          setError(error.message || 'Failed to fetch order');
          setLoading(false);
        }
      }
    };

    fetchOrder();

    return () => clearTimeout(timeoutId);
  }, [orderId]);

  if (loading) return <div className="text-center py-12">Loading order details...</div>;
  if (error || !order)
    return (
      <div className="text-center text-red-600 py-12">Error: {error || 'Order not found'}</div>
    );

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/orders" className="flex items-center text-gray-500 hover:text-gray-900 mb-6 w-max">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Orders
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Order Details</h1>
            <p className="text-sm text-gray-500 font-mono">{order.orderId}</p>
          </div>

          <div
            className={`flex items-center px-4 py-2 rounded-lg ${
              order.status === 'CONFIRMED'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : order.status === 'REJECTED'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            }`}
          >
            {order.status === 'PENDING' && <Clock className="w-5 h-5 mr-2 animate-pulse" />}
            {order.status === 'CONFIRMED' && <CheckCircle className="w-5 h-5 mr-2" />}
            {order.status === 'REJECTED' && <XCircle className="w-5 h-5 mr-2" />}
            <span className="font-semibold">{order.status}</span>
          </div>
        </div>

        {order.status === 'REJECTED' && order.rejectionReason && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-6">
            <strong>Reason for rejection:</strong> {order.rejectionReason}
          </div>
        )}

        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Items</h2>
          <ul className="divide-y divide-gray-100">
            {order.items.map((item, idx) => {
              const prod = products[item.productId];
              return (
                <li key={idx} className="py-3 flex justify-between items-center">
                  <div className="flex items-center">
                    {prod?.imageUrl && (
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="w-12 h-12 object-cover rounded mr-4 border"
                      />
                    )}
                    <div>
                      <p className="font-medium">{prod?.name || 'Unknown Product'}</p>
                      <p className="text-sm text-gray-500">
                        Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium">${(item.unitPrice * item.quantity).toFixed(2)}</p>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-between items-center pt-6 border-t mt-4">
          <span className="font-bold text-lg">Total</span>
          <span className="font-bold text-xl text-indigo-600">
            ${order.totalAmount.toFixed(2)} {order.currency}
          </span>
        </div>
      </div>
    </div>
  );
};
