import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Product } from '../api/catalogue';
import { getProducts } from '../api/catalogue';
import { useCart } from '../cart/CartProvider';

export const Catalogue: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addToCart } = useCart();
  const location = useLocation();

  useEffect(() => {
    getProducts()
      .then((allProducts) => {
        const params = new URLSearchParams(location.search);
        const searchQuery = params.get('search')?.toLowerCase();
        const categoryQuery = params.get('category')?.toLowerCase();

        let filtered = allProducts;
        if (searchQuery) {
          filtered = filtered.filter(
            (p) =>
              p.name.toLowerCase().includes(searchQuery) ||
              (p.description && p.description.toLowerCase().includes(searchQuery)),
          );
        }
        if (categoryQuery) {
          filtered = filtered.filter(
            (p) =>
              p.name.toLowerCase().includes(categoryQuery) ||
              (p.description && p.description.toLowerCase().includes(categoryQuery)),
          );
        }
        setProducts(filtered);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [location.search]);

  if (loading)
    return (
      <div className="text-center py-20 text-sm uppercase tracking-wider text-gray-400">
        Loading products...
      </div>
    );
  if (error) return <div className="text-center text-red-600 py-20 text-sm">Error: {error}</div>;
  if (products.length === 0)
    return <div className="text-center py-20 text-gray-500 text-sm">No products available.</div>;

  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">All Products</h1>
          <p className="text-sm text-gray-500 mt-2">
            {products.length} {products.length === 1 ? 'item' : 'items'}
          </p>
        </div>
      </div>

      {/* Product Grid */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
          {products.map((product) => (
            <div key={product.productId} className="group flex flex-col">
              <Link to={`/products/${product.productId}`} className="block">
                <div className="aspect-square bg-gray-100 border border-gray-200 overflow-hidden mb-4">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <span className="text-gray-300 text-xs font-mono">No image</span>
                    </div>
                  )}
                </div>
                <h3 className="text-sm font-bold text-gray-900 group-hover:underline truncate">
                  {product.name}
                </h3>
              </Link>
              <p className="text-sm text-gray-900 font-semibold mt-1">
                ${product.price.toFixed(2)} {product.currency}
              </p>
              <div className="mt-4">
                <button
                  onClick={() => addToCart(product)}
                  className="w-full bg-black text-white py-2.5 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
                >
                  Add to Bag
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
