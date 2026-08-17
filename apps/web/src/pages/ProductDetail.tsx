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

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (error || !product)
    return (
      <div className="text-center text-red-600 py-12">Error: {error || 'Product not found'}</div>
    );

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden md:flex">
        <div className="md:w-1/2 h-64 md:h-auto bg-gray-100 flex items-center justify-center">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-gray-400">No image available</span>
          )}
        </div>
        <div className="p-8 md:w-1/2 flex flex-col">
          <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
          <p className="text-2xl font-semibold text-indigo-600 mt-4">
            ${product.price.toFixed(2)} {product.currency}
          </p>

          <div className="mt-6 prose text-gray-600 flex-1">
            <p>{product.description || 'No description available for this product.'}</p>
          </div>

          <div className="mt-8">
            <button
              onClick={() => addToCart(product)}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 font-medium text-lg transition-colors shadow-sm"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
