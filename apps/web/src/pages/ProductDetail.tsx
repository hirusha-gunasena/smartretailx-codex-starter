import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Product } from '../api/catalogue';
import { getProduct } from '../api/catalogue';
import { useCart } from '../cart/CartProvider';
import { Plus, Minus, ChevronDown, ChevronUp, Truck, ShieldCheck } from 'lucide-react';

export const ProductDetail: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [quantity, setQuantity] = useState(1);
  const [openAccordion, setOpenAccordion] = useState<string | null>('details');
  
  const { addToCart } = useCart();

  useEffect(() => {
    if (!productId) return;
    getProduct(productId)
      .then((data) => {
        // Backend returns { success: true, data: Product }
        setProduct((data as any).data || data);
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
    setOpenAccordion(prev => prev === section ? null : section);
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
          <button onClick={() => navigate('/')} className="hover:text-black transition-colors">Home</button>
          <span className="mx-2">/</span>
          <button onClick={() => navigate('/catalogue')} className="hover:text-black transition-colors">Catalogue</button>
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
                  <span className="text-gray-300 text-sm font-mono tracking-wider">No image available</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Product Details */}
          <div className="w-full lg:w-2/5 flex flex-col pt-4">
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">{product.name}</h1>
            <p className="text-2xl font-medium text-gray-900 mt-6">
              ${product.price.toFixed(2)} <span className="text-base text-gray-500 font-normal">{product.currency}</span>
            </p>
            
            <div className="mt-8">
              <p className="text-gray-600 leading-relaxed">
                {product.description || 'Premium engineering meets minimalist design. Built for those who demand performance and aesthetics.'}
              </p>
            </div>

            {/* Quantity and Add to Cart */}
            <div className="mt-12 space-y-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-900 mb-3 block">Quantity</span>
                <div className="flex items-center border border-gray-300 w-32">
                  <button 
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-3 hover:bg-gray-50 transition-colors text-gray-600"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="flex-1 text-center font-medium text-gray-900">{quantity}</span>
                  <button 
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-3 hover:bg-gray-50 transition-colors text-gray-600"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                className="w-full bg-black text-white py-5 text-sm font-semibold uppercase tracking-widest hover:bg-gray-900 transition-colors"
              >
                Add to Bag — ${(product.price * quantity).toFixed(2)}
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
                  <span className="text-sm font-semibold uppercase tracking-widest text-gray-900">Details</span>
                  {openAccordion === 'details' ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </button>
                {openAccordion === 'details' && (
                  <div className="mt-4 text-sm text-gray-600 leading-relaxed pr-6">
                    <p>Designed with absolute precision and manufactured using high-grade materials. This product integrates seamlessly into your digital ecosystem, providing robust performance without compromising on aesthetics.</p>
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
                  <span className="text-sm font-semibold uppercase tracking-widest text-gray-900">Shipping & Returns</span>
                  {openAccordion === 'shipping' ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </button>
                {openAccordion === 'shipping' && (
                  <div className="mt-4 text-sm text-gray-600 leading-relaxed pr-6">
                    <p>We offer free standard shipping on all orders over $200. Expedited shipping is available at checkout.</p>
                    <p className="mt-2">Returns are accepted within 30 days of delivery. The item must be in its original packaging and unused condition.</p>
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
