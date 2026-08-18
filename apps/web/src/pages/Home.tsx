import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Truck, ShieldCheck, RefreshCw } from 'lucide-react';

interface Product {
  productId: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
}

export const Home: React.FC = () => {
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);

  useEffect(() => {
    // Fetch some products for the trending section. 
    // For now we will just use a mock or fetch from the API directly.
    fetch('https://614kzoojzg.execute-api.ap-south-1.amazonaws.com/api/v1/products')
      .then(res => res.json())
      .then(data => {
        if (data && data.items) {
          // Take first 4 items as trending
          setTrendingProducts(data.items.slice(0, 4));
        }
      })
      .catch(err => console.error("Failed to load trending products:", err));
  }, []);

  return (
    <div className="flex flex-col bg-white">
      {/* Hero Section - Minimalist & Product Centric */}
      <section className="relative w-full h-[70vh] min-h-[600px] flex items-center bg-gray-50 overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          <img 
            src="/premium-hero.jpg" 
            alt="Premium Tech Desk Setup" 
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/20"></div> {/* Subtle overlay for text readability */}
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-xl">
            <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
              Elevate Your Workspace.
            </h1>
            <p className="text-lg text-gray-100 mb-8 font-medium">
              Discover our curated collection of premium electronics designed for professionals who demand the best.
            </p>
            <Link 
              to="/products" 
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-gray-900 font-bold rounded-none hover:bg-gray-100 transition-colors uppercase tracking-widest text-sm"
            >
              Shop Collection
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Shop by Category</h2>
            <Link to="/products" className="text-gray-900 font-semibold flex items-center gap-2 hover:underline">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link to="/products?category=laptops" className="group block relative h-80 bg-gray-100 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
              <div className="absolute inset-0 bg-gray-200 group-hover:scale-105 transition-transform duration-500 flex items-center justify-center">
                 <img src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" alt="Laptops" className="w-full h-full object-cover" />
              </div>
              <div className="absolute bottom-0 left-0 p-8 z-20">
                <h3 className="text-2xl font-bold text-white mb-2">Laptops & Computers</h3>
                <span className="text-white/80 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Shop Now <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </Link>

            <Link to="/products?category=audio" className="group block relative h-80 bg-gray-100 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
              <div className="absolute inset-0 bg-gray-300 group-hover:scale-105 transition-transform duration-500 flex items-center justify-center">
                 <img src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" alt="Audio" className="w-full h-full object-cover" />
              </div>
              <div className="absolute bottom-0 left-0 p-8 z-20">
                <h3 className="text-2xl font-bold text-white mb-2">Premium Audio</h3>
                <span className="text-white/80 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Shop Now <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </Link>

            <Link to="/products?category=accessories" className="group block relative h-80 bg-gray-100 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
              <div className="absolute inset-0 bg-gray-200 group-hover:scale-105 transition-transform duration-500 flex items-center justify-center">
                 <img src="https://images.unsplash.com/photo-1572569433114-699257f86488?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" alt="Accessories" className="w-full h-full object-cover" />
              </div>
              <div className="absolute bottom-0 left-0 p-8 z-20">
                <h3 className="text-2xl font-bold text-white mb-2">Accessories</h3>
                <span className="text-white/80 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Shop Now <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Trending Products */}
      <section className="py-20 bg-gray-50 border-y border-gray-200">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Trending Now</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {trendingProducts.length > 0 ? (
              trendingProducts.map((product) => (
                <Link key={product.productId} to={`/products/${product.productId}`} className="group block">
                  <div className="aspect-square bg-gray-100 border border-gray-200 mb-4 overflow-hidden relative">
                    {product.imageUrl ? (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-300 group-hover:scale-105 transition-transform duration-500">
                        <span className="font-mono text-xs">No image</span>
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1 group-hover:underline">{product.name}</h3>
                  <p className="text-sm text-gray-500 mb-2 truncate">{product.description}</p>
                  <p className="text-sm font-semibold text-gray-900">${product.price.toFixed(2)}</p>
                </Link>
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-gray-500">Loading trending products...</div>
            )}
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-gray-200">
            <div className="flex flex-col items-center py-4 md:py-0 px-4">
              <Truck className="w-8 h-8 text-gray-900 mb-4" strokeWidth={1.5} />
              <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Free Shipping</h3>
              <p className="text-sm text-gray-500">On all orders over $150</p>
            </div>
            <div className="flex flex-col items-center py-4 md:py-0 px-4">
              <RefreshCw className="w-8 h-8 text-gray-900 mb-4" strokeWidth={1.5} />
              <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">30-Day Returns</h3>
              <p className="text-sm text-gray-500">No questions asked</p>
            </div>
            <div className="flex flex-col items-center py-4 md:py-0 px-4">
              <ShieldCheck className="w-8 h-8 text-gray-900 mb-4" strokeWidth={1.5} />
              <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Secure Payment</h3>
              <p className="text-sm text-gray-500">100% secure checkout</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
