import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Package, Users, ShoppingCart, LogOut, Settings } from 'lucide-react';
import { useSession } from '../auth/AuthProvider';

export const AdminLayout: React.FC = () => {
  const { user, logout } = useSession();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { name: 'Products', path: '/admin/products', icon: Package },
    { name: 'Users', path: '/admin/users', icon: Users },
    { name: 'Orders', path: '/admin/orders', icon: ShoppingCart },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans selection:bg-black selection:text-white">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10">
        <div className="h-20 flex items-center px-6 border-b border-gray-200">
          <Link
            to="/"
            className="text-xl font-extrabold text-black tracking-tight flex items-center gap-2"
          >
            <Settings className="w-6 h-6" strokeWidth={1.5} />
            ADMIN PANEL
          </Link>
        </div>

        <nav className="flex-1 py-8 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold uppercase tracking-wider rounded-none transition-colors ${
                  active
                    ? 'bg-black text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="mb-4 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
            {(user as { email?: string })?.email}
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold uppercase tracking-wider text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.5} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="h-20 bg-white border-b border-gray-200 sticky top-0 z-10 px-8 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">
            {navItems.find((n) => isActive(n.path))?.name || 'Dashboard'}
          </h2>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-black transition-colors"
            >
              View Storefront &rarr;
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
