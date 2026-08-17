import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { ShoppingCart, User as UserIcon, LogOut, Package, Settings } from 'lucide-react';
import { useSession } from '../auth/AuthProvider';
import { useCart } from '../cart/CartProvider';

export const Layout: React.FC = () => {
  const { isAuthenticated, user, role, login, logout } = useSession();
  const { items } = useCart();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-indigo-600 flex items-center gap-2">
              <Package className="w-6 h-6" />
              SmartRetailX
            </Link>

            <nav className="hidden md:flex gap-4">
              <Link to="/products" className="text-gray-600 hover:text-gray-900 font-medium">
                Products
              </Link>
              {isAuthenticated && (
                <Link to="/orders" className="text-gray-600 hover:text-gray-900 font-medium">
                  My Orders
                </Link>
              )}
              {role === 'admin' && (
                <Link
                  to="/admin/products"
                  className="text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1"
                >
                  <Settings className="w-4 h-4" /> Admin
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/cart" className="relative text-gray-600 hover:text-gray-900">
              <ShoppingCart className="w-6 h-6" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </Link>

            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                  <UserIcon className="w-4 h-4" />
                  <span
                    className="font-medium truncate max-w-[120px]"
                    title={(user as { email?: string })?.email}
                  >
                    {(user as { email?: string })?.email}
                  </span>
                </div>
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => login()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} SmartRetailX. All rights reserved.
        </div>
      </footer>
    </div>
  );
};
