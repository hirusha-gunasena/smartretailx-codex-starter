import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Product } from '../api/catalogue';
import { getProduct } from '../api/catalogue';
import { getInventory } from '../api/inventory';
import { useCart } from '../cart/CartProvider';
import {
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Truck,
  ShieldCheck,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const ProductDetail: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [availableQuantity, setAvailableQuantity] = useState<number | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [openAccordion, setOpenAccordion] = useState<string | null>('details');

  const { addToCart } = useCart();

  useEffect(() => {
    if (!productId) return;

    Promise.all([
      getProduct(productId),
      getInventory(productId).catch(() => ({ availableQuantity: 0 })), // fallback if inventory fails or not found
    ])
      .then(([productData, inventoryData]) => {
        setProduct(productData);
        setAvailableQuantity(inventoryData.availableQuantity || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [productId]);

  const handleAddToCart = () => {
    if (!product) return;
    // Call addToCart multiple times for quantity, or if addToCart supports quantity we use it
    // The current addToCart signature just takes a Product. So we'll loop.
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }
    // Simple visual feedback could go here, but CartProvider usually handles notification
  };

  const toggleAccordion = (section: string) => {
    setOpenAccordion((prev) => (prev === section ? null : section));
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-sm uppercase tracking-wider text-gray-400">
        Loading Product...
      </div>
    );

  if (error || !product)
    return (
      <div className="min-h-screen flex items-center justify-center text-center text-red-600 text-sm">
        Error: {error || 'Product not found'}
      </div>
    );

  return (
    <div className="bg-white min-h-screen">
      {/* Breadcrumb Navigation */}
      <div className="max-w-7xl mx-auto px-6 py-6 border-b border-gray-100">
        <nav className="flex text-xs uppercase tracking-widest text-gray-500 font-medium">
          <button onClick={() => navigate('/')} className="hover:text-black transition-colors">
            Home
          </button>
          <span className="mx-2">/</span>
          <button
            onClick={() => navigate('/catalogue')}
            className="hover:text-black transition-colors"
          >
            Catalogue
          </button>
          <span className="mx-2">/</span>
          <span className="text-black truncate">{product.name}</span>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="flex flex-col lg:flex-row gap-16">
          {/* Left: Product Imagery (Sticky) */}
          <div className="w-full lg:w-3/5">
            <div className="sticky top-24">
              <div className="aspect-[4/5] md:aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-300 text-sm font-mono tracking-wider">
                    No image available
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Product Details */}
          <div className="w-full lg:w-2/5 flex flex-col pt-4">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
                {product.name}
              </h1>
            </div>

            <div className="flex items-center space-x-4 mt-6">
              <p className="text-2xl font-medium text-gray-900">
                ${product.price.toFixed(2)}{' '}
                <span className="text-base text-gray-500 font-normal">{product.currency}</span>
              </p>
              {availableQuantity !== null && (
                <span
                  className={`flex items-center text-xs font-semibold uppercase tracking-widest px-3 py-1 border ${availableQuantity > 0 ? 'text-green-700 border-green-200 bg-green-50' : 'text-red-700 border-red-200 bg-red-50'}`}
                >
                  {availableQuantity > 0 ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> In Stock
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 mr-1" /> Out of Stock
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="mt-8">
              <p className="text-gray-600 leading-relaxed">
                {product.description ||
                  'Premium engineering meets minimalist design. Built for those who demand performance and aesthetics.'}
              </p>
            </div>

            {/* Quantity and Add to Cart */}
            <div className="mt-12 space-y-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-900 mb-3 block">
                  Quantity
                </span>
                <div
                  className={`flex items-center border w-32 ${availableQuantity === 0 ? 'border-gray-200 opacity-50' : 'border-gray-300'}`}
                >
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={availableQuantity === 0}
                    className="p-3 hover:bg-gray-50 transition-colors text-gray-600 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="flex-1 text-center font-medium text-gray-900">{quantity}</span>
                  <button
                    onClick={() =>
                      setQuantity(
                        availableQuantity && availableQuantity > 0
                          ? Math.min(availableQuantity, quantity + 1)
                          : quantity + 1,
                      )
                    }
                    disabled={
                      availableQuantity === 0 ||
                      (availableQuantity !== null && quantity >= availableQuantity)
                    }
                    className="p-3 hover:bg-gray-50 transition-colors text-gray-600 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={availableQuantity === 0}
                className={`w-full py-5 text-sm font-semibold uppercase tracking-widest transition-colors ${
                  availableQuantity === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-black text-white hover:bg-gray-900'
                }`}
              >
                {availableQuantity === 0
                  ? 'Out of Stock'
                  : `Add to Bag — $${(product.price * quantity).toFixed(2)}`}
              </button>
            </div>

            {/* Trust Badges */}
            <div className="mt-10 grid grid-cols-2 gap-4 py-6 border-y border-gray-100">
              <div className="flex items-center text-sm text-gray-600">
                <Truck className="w-5 h-5 mr-3 text-gray-400" />
                <span>Complimentary Shipping</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <ShieldCheck className="w-5 h-5 mr-3 text-gray-400" />
                <span>2-Year Warranty</span>
              </div>
            </div>

            {/* Accordions */}
            <div className="mt-10 divide-y divide-gray-100">
              {/* Details Accordion */}
              <div className="py-4">
                <button
                  onClick={() => toggleAccordion('details')}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-sm font-semibold uppercase tracking-widest text-gray-900">
                    Details
                  </span>
                  {openAccordion === 'details' ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </button>
                {openAccordion === 'details' && (
                  <div className="mt-4 text-sm text-gray-600 leading-relaxed pr-6">
                    <p>
                      Designed with absolute precision and manufactured using high-grade materials.
                      This product integrates seamlessly into your digital ecosystem, providing
                      robust performance without compromising on aesthetics.
                    </p>
                    <ul className="list-disc pl-5 mt-3 space-y-1">
                      <li>Sleek, minimalist architecture</li>
                      <li>High-durability finish</li>
                      <li>Optimized for daily rigorous use</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Shipping Accordion */}
              <div className="py-4">
                <button
                  onClick={() => toggleAccordion('shipping')}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-sm font-semibold uppercase tracking-widest text-gray-900">
                    Shipping & Returns
                  </span>
                  {openAccordion === 'shipping' ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </button>
                {openAccordion === 'shipping' && (
                  <div className="mt-4 text-sm text-gray-600 leading-relaxed pr-6">
                    <p>
                      We offer free standard shipping on all orders over $200. Expedited shipping is
                      available at checkout.
                    </p>
                    <p className="mt-2">
                      Returns are accepted within 30 days of delivery. The item must be in its
                      original packaging and unused condition.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
