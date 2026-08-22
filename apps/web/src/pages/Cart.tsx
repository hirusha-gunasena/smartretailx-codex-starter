import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useCart } from '../cart/CartProvider';
import { useSession } from '../auth/AuthProvider';
import { Trash2, Plus, Minus } from 'lucide-react';

export const Cart: React.FC = () => {
  const { items, updateQuantity, removeFromCart, total } = useCart();
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();

  const handleCheckout = () => {
    if (isAuthenticated) {
      navigate('/checkout');
    } else {
      toast.error('Please sign in to place an order');
    }
  };

  if (items.length === 0) {
    return (
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-6 py-24 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Your bag is empty</h2>
          <p className="text-gray-500 text-sm mb-8">Looks like you haven't added anything yet.</p>
          <Link
            to="/products"
            className="inline-block bg-black text-white px-8 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Shopping Bag</h1>
          <p className="text-sm text-gray-500 mt-2">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <ul className="divide-y divide-gray-200">
              {items.map((item) => (
                <li key={item.productId} className="py-8 flex items-start gap-6">
                  <div className="w-28 h-28 bg-gray-100 border border-gray-200 flex-shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <span className="text-xs text-gray-300 font-mono">No img</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <Link
                        to={`/products/${item.productId}`}
                        className="font-bold text-gray-900 hover:underline text-sm"
                      >
                        {item.name}
                      </Link>
                      <p className="text-gray-500 text-sm mt-1">
                        {item.price.toFixed(2)} {item.currency}
                      </p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center border border-gray-200">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="p-2.5 hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          <Minus className="w-3 h-3" strokeWidth={2} />
                        </button>
                        <span className="px-4 font-semibold text-sm w-12 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="p-2.5 hover:bg-gray-50 text-gray-600 transition-colors"
                        >
                          <Plus className="w-3 h-3" strokeWidth={2} />
                        </button>
                      </div>

                      <div className="font-bold text-sm text-gray-900 min-w-[80px] text-right">
                        ${(item.price * item.quantity).toFixed(2)}
                      </div>

                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-gray-50 border border-gray-200 p-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">
                Order Summary
              </h2>
              <div className="flex justify-between items-center mb-4 text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold text-gray-900">${total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mb-4 text-sm">
                <span className="text-gray-500">Shipping</span>
                <span className="font-semibold text-gray-900">
                  {total >= 150 ? 'Free' : '$9.99'}
                </span>
              </div>
              <div className="border-t border-gray-200 mt-6 pt-6 flex justify-between items-center">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-bold text-lg text-gray-900">
                  ${(total + (total >= 150 ? 0 : 9.99)).toFixed(2)}
                </span>
              </div>

              <button
                onClick={handleCheckout}
                className="mt-8 w-full bg-black text-white py-4 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
              >
                Proceed to Checkout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
