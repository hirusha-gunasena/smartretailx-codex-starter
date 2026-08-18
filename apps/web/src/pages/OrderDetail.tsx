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
          setError(error.message || 'Failed to fetch order');
          setLoading(false);
        }
      }
    };

    fetchOrder();

    return () => clearTimeout(timeoutId);
  }, [orderId]);

  if (loading)
    return (
      <div className="text-center py-20 text-sm uppercase tracking-wider text-gray-400">
        Loading order details...
      </div>
    );
  if (error || !order)
    return (
      <div className="text-center text-red-600 py-20 text-sm">
        Error: {error || 'Order not found'}
      </div>
    );

  const statusConfig = {
    PENDING: {
      icon: <Clock className="w-4 h-4 mr-2 animate-pulse" strokeWidth={1.5} />,
      style: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    },
    CONFIRMED: {
      icon: <CheckCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />,
      style: 'bg-green-50 text-green-700 border border-green-200',
    },
    REJECTED: {
      icon: <XCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />,
      style: 'bg-red-50 text-red-700 border border-red-200',
    },
  };

  const config = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.PENDING;

  return (
    <div className="bg-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <Link
          to="/orders"
          className="flex items-center text-gray-500 hover:text-gray-900 text-xs uppercase tracking-wider font-semibold mb-8 transition-colors w-max"
        >
          <ArrowLeft className="w-4 h-4 mr-2" strokeWidth={1.5} /> Back to Orders
        </Link>

        <div className="border border-gray-200">
          {/* Order Header */}
          <div className="p-8 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Order Details</h1>
              <p className="text-xs text-gray-400 font-mono mt-1 uppercase tracking-wider">
                #{order.orderId}
              </p>
            </div>
            <div
              className={`flex items-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${config.style}`}
            >
              {config.icon}
              {order.status}
            </div>
          </div>

          {/* Rejection Reason */}
          {order.status === 'REJECTED' && order.rejectionReason && (
            <div className="mx-8 mt-6 bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
              <strong>Reason for rejection:</strong> {order.rejectionReason}
            </div>
          )}

          {/* Items */}
          <div className="p-8 border-b border-gray-200">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">
              Items
            </h2>
            <ul className="divide-y divide-gray-100">
              {order.items.map((item, idx) => {
                const prod = products[item.productId];
                return (
                  <li key={idx} className="py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      {prod?.imageUrl && (
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="w-14 h-14 object-cover border border-gray-200"
                        />
                      )}
                      <div>
                        <p className="font-semibold text-sm text-gray-900">
                          {prod?.name || 'Unknown Product'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-sm text-gray-900">
                      ${(item.unitPrice * item.quantity).toFixed(2)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Total */}
          <div className="p-8 bg-gray-50 flex justify-between items-center">
            <span className="font-bold text-gray-900">Total</span>
            <span className="font-bold text-lg text-gray-900">
              ${order.totalAmount.toFixed(2)} {order.currency}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
