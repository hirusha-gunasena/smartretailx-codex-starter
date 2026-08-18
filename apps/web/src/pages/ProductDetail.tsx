import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Product } from '../api/catalogue';
import { getProduct } from '../api/catalogue';
import { useCart } from '../cart/CartProvider';
import { ArrowLeft } from 'lucide-react';

export const ProductDetail: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addToCart } = useCart();

  useEffect(() => {
    if (!productId) return;
    getProduct(productId)
      .then(setProduct)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading)
    return (
      <div className="text-center py-20 text-sm uppercase tracking-wider text-gray-400">
        Loading...
      </div>
    );
  if (error || !product)
    return (
      <div className="text-center text-red-600 py-20 text-sm">
        Error: {error || 'Product not found'}
      </div>
    );

  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-500 hover:text-gray-900 text-xs uppercase tracking-wider font-semibold mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" strokeWidth={1.5} /> Back
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Product Image */}
          <div className="aspect-square bg-gray-100 border border-gray-200 overflow-hidden">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <span className="text-gray-300 text-xs font-mono">No image available</span>
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="flex flex-col justify-center">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{product.name}</h1>
            <p className="text-2xl font-semibold text-gray-900 mt-4">
              ${product.price.toFixed(2)} {product.currency}
            </p>

            <div className="border-t border-gray-200 mt-8 pt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Description
              </h2>
              <p className="text-gray-600 leading-relaxed">
                {product.description || 'No description available for this product.'}
              </p>
            </div>

            <div className="mt-10">
              <button
                onClick={() => addToCart(product)}
                className="w-full bg-black text-white py-4 text-sm font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
              >
                Add to Bag
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
