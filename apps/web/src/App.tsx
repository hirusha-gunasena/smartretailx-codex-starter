import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { useSession } from './auth/AuthProvider';

// Pages
import { Home } from './pages/Home';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { FAQ } from './pages/FAQ';
import { Catalogue } from './pages/Catalogue';
import { ProductDetail } from './pages/ProductDetail';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { MyOrders } from './pages/MyOrders';
import { OrderDetail } from './pages/OrderDetail';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminOrders } from './pages/admin/AdminOrders';

const PrivateRoute = ({ roles }: { roles?: ('admin' | 'customer')[] }) => {
  const { isAuthenticated, isLoading, role } = useSession();

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (roles && role && !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

const App: React.FC = () => {
  return (
    <>
      <Toaster 
        position="bottom-center" 
        toastOptions={{
          style: {
            background: '#000',
            color: '#fff',
            borderRadius: '0px',
            fontSize: '14px',
            fontWeight: 500,
          }
        }} 
      />
      <Routes>
        <Route element={<Layout />}>
        {/* Public Routes */}
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<FAQ />} />
        <Route
          path="/auth/callback"
          element={<div className="p-8 text-center text-gray-500">Completing sign in...</div>}
        />
        <Route path="/products" element={<Catalogue />} />
        <Route path="/products/:productId" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />

        {/* Protected Routes (Any authenticated user) */}
        <Route element={<PrivateRoute />}>
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<MyOrders />} />
          <Route path="/orders/:orderId" element={<OrderDetail />} />
        </Route>

        {/* Admin Routes */}
        <Route element={<PrivateRoute roles={['admin']} />}>
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
        </Route>
        </Route>
      </Routes>
    </>
  );
};

export default App;
