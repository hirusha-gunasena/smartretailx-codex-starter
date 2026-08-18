import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, User as UserIcon, LogOut, Package, Settings, Search } from 'lucide-react';
import { useSession } from '../auth/AuthProvider';
import { useCart } from '../cart/CartProvider';

export const Layout: React.FC = () => {
  const { isAuthenticated, user, role, login, logout } = useSession();
  const { items } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const isActive = (path: string) => location.pathname === path;

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = formData.get('q') as string;
    if (q) navigate(`/products?search=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans selection:bg-black selection:text-white">
      {/* Minimalist Professional Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        {/* Top Banner (Optional promo bar) */}
        <div className="bg-black text-white text-xs text-center py-2 px-4 uppercase tracking-wider font-semibold">
          Free standard shipping on orders over $150
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="text-2xl font-extrabold text-black tracking-tight flex items-center gap-2"
            >
              <Package className="w-7 h-7" strokeWidth={1.5} />
              SMARTRETAILX
            </Link>

            <nav className="hidden md:flex items-center gap-6 ml-4">
              <Link
                to="/products"
                className={`text-sm font-semibold uppercase tracking-wider transition-colors hover:text-gray-500 ${isActive('/products') ? 'text-black' : 'text-gray-900'}`}
              >
                Shop
              </Link>
              <Link
                to="/about"
                className={`text-sm font-semibold uppercase tracking-wider transition-colors hover:text-gray-500 ${isActive('/about') ? 'text-black' : 'text-gray-900'}`}
              >
                About
              </Link>
              {isAuthenticated && (
                <Link
                  to="/orders"
                  className={`text-sm font-semibold uppercase tracking-wider transition-colors hover:text-gray-500 ${isActive('/orders') ? 'text-black' : 'text-gray-900'}`}
                >
                  Orders
                </Link>
              )}
              {isAuthenticated && role === 'admin' && (
                <Link
                  to="/admin/products"
                  className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-1 transition-colors hover:text-gray-500 ${location.pathname.startsWith('/admin') ? 'text-black' : 'text-gray-900'}`}
                >
                  <Settings className="w-4 h-4" /> Admin
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <form
              onSubmit={handleSearch}
              className="hidden sm:flex items-center gap-2 border-b border-gray-200 focus-within:border-gray-900 pb-1 transition-colors"
            >
              <Search className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
              <input
                type="text"
                name="q"
                placeholder="SEARCH..."
                className="text-xs font-semibold uppercase tracking-wider outline-none w-24 focus:w-32 transition-all bg-transparent placeholder-gray-400 text-gray-900"
              />
            </form>

            {isAuthenticated ? (
              <div className="flex items-center gap-6 group relative">
                <button className="flex items-center gap-2 text-gray-900 hover:text-gray-500 transition-colors">
                  <UserIcon className="w-5 h-5" strokeWidth={1.5} />
                  <span className="text-sm font-semibold uppercase tracking-wider hidden lg:inline">
                    Account
                  </span>
                </button>
                {/* Minimalist Dropdown */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="p-4 border-b border-gray-100">
                    <span className="block text-xs text-gray-500 mb-1">Signed in as</span>
                    <span className="block text-sm font-semibold text-gray-900 truncate">
                      {(user as { email?: string })?.email}
                    </span>
                  </div>
                  <button
                    onClick={() => logout()}
                    className="w-full text-left px-4 py-3 text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => login()}
                className="flex items-center gap-2 text-gray-900 hover:text-gray-500 transition-colors"
              >
                <UserIcon className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-sm font-semibold uppercase tracking-wider hidden lg:inline">
                  Sign In
                </span>
              </button>
            )}

            <Link
              to="/cart"
              className="relative flex items-center gap-2 text-gray-900 hover:text-gray-500 transition-colors"
            >
              <div className="relative">
                <ShoppingCart className="w-5 h-5" strokeWidth={1.5} />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-black text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold uppercase tracking-wider hidden lg:inline">
                Bag
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full mx-auto">
        <Outlet />
      </main>

      {/* Clean Minimalist Footer */}
      <footer className="bg-white border-t border-gray-200 pt-16 pb-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-1">
              <Link
                to="/"
                className="text-xl font-extrabold text-black tracking-tight flex items-center gap-2 mb-6"
              >
                <Package className="w-6 h-6" strokeWidth={1.5} />
                SMARTRETAILX
              </Link>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                Elevating your lifestyle with premium technology. Designed for the future, delivered
                today.
              </p>
              <div className="flex gap-6">
                <a
                  href="#"
                  className="text-gray-400 hover:text-black transition-colors text-xs font-semibold uppercase tracking-wider"
                >
                  Twitter
                </a>
                <a
                  href="#"
                  className="text-gray-400 hover:text-black transition-colors text-xs font-semibold uppercase tracking-wider"
                >
                  Facebook
                </a>
                <a
                  href="#"
                  className="text-gray-400 hover:text-black transition-colors text-xs font-semibold uppercase tracking-wider"
                >
                  Instagram
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-black mb-6 uppercase tracking-wider text-xs">
                Shop
              </h4>
              <ul className="space-y-4">
                <li>
                  <Link
                    to="/products"
                    className="text-gray-500 hover:text-black transition-colors text-sm"
                  >
                    All Products
                  </Link>
                </li>
                <li>
                  <Link
                    to="/products?category=electronics"
                    className="text-gray-500 hover:text-black transition-colors text-sm"
                  >
                    Electronics
                  </Link>
                </li>
                <li>
                  <Link
                    to="/products?category=accessories"
                    className="text-gray-500 hover:text-black transition-colors text-sm"
                  >
                    Accessories
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-black mb-6 uppercase tracking-wider text-xs">
                Support
              </h4>
              <ul className="space-y-4">
                <li>
                  <Link
                    to="/faq"
                    className="text-gray-500 hover:text-black transition-colors text-sm"
                  >
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link
                    to="/contact"
                    className="text-gray-500 hover:text-black transition-colors text-sm"
                  >
                    Contact Us
                  </Link>
                </li>
                <li>
                  <a href="#" className="text-gray-500 hover:text-black transition-colors text-sm">
                    Shipping & Returns
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-black mb-6 uppercase tracking-wider text-xs">
                Company
              </h4>
              <ul className="space-y-4">
                <li>
                  <Link
                    to="/about"
                    className="text-gray-500 hover:text-black transition-colors text-sm"
                  >
                    About Us
                  </Link>
                </li>
                <li>
                  <a href="#" className="text-gray-500 hover:text-black transition-colors text-sm">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-500 hover:text-black transition-colors text-sm">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row items-center justify-between">
            <p className="text-gray-400 text-xs tracking-wider uppercase mb-4 md:mb-0">
              &copy; {new Date().getFullYear()} SmartRetailX. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
