import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../api/catalogue';
import { getProducts } from '../api/catalogue';
import { useCart } from '../cart/CartProvider';

export const Catalogue: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addToCart } = useCart();

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12">Loading products...</div>;
  if (error) return <div className="text-center text-red-600 py-12">Error: {error}</div>;
  if (products.length === 0)
    return <div className="text-center py-12 text-gray-500">No products available.</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Our Products</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {products.map((product) => (
          <div
            key={product.productId}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
          >
            <div className="h-48 bg-gray-100 flex items-center justify-center">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-gray-400">No image</span>
              )}
            </div>
            <div className="p-4 flex flex-col flex-1">
              <Link
                to={`/products/${product.productId}`}
                className="font-semibold text-lg hover:text-indigo-600 truncate"
                title={product.name}
              >
                {product.name}
              </Link>
              <p className="text-gray-900 font-bold mt-2">
                ${product.price.toFixed(2)} {product.currency}
              </p>

              <div className="mt-auto pt-4">
                <button
                  onClick={() => addToCart(product)}
                  className="w-full bg-indigo-50 text-indigo-700 py-2 rounded-md hover:bg-indigo-100 font-medium transition-colors"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
