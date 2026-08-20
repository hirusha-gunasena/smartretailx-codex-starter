import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Truck, ShieldCheck, RefreshCw, ChevronRight } from 'lucide-react';

interface Product {
  productId: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
}

export const Home: React.FC = () => {
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);

  useEffect(() => {
    fetch('https://614kzoojzg.execute-api.ap-south-1.amazonaws.com/api/v1/products')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.data)) {
          // Mock different sections by slicing the products list
          setTrendingProducts(data.data.slice(0, 4));
          setNewArrivals(data.data.slice(4, 8)); // Use different items for new arrivals
        }
      })
      .catch((err) => console.error('Failed to load products:', err));
  }, []);

  return (
    <div className="flex flex-col bg-white">
      {/* Dynamic Hero Section */}
      <section className="relative w-full h-[85vh] min-h-[700px] flex items-center overflow-hidden bg-black">
        <div className="absolute inset-0 w-full h-full">
          <img
            src="https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?ixlib=rb-4.0.3&auto=format&fit=crop&w=2560&q=80"
            alt="Premium minimalist workspace setup"
            className="w-full h-full object-cover object-center opacity-70 scale-105 animate-slow-zoom"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent"></div>
        </div>

        <div className="container mx-auto px-6 relative z-10 flex flex-col justify-center h-full">
          <div className="max-w-2xl">
            <span className="text-gray-300 font-medium tracking-[0.2em] uppercase text-sm mb-4 block">
              The Minimalist Collection
            </span>
            <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight leading-[1.1] mb-6">
              Design Meets <br />
              <span className="text-gray-300 italic font-light">Performance.</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-lg font-light">
              Elevate your creative workflow with our curated selection of premium electronics and
              workspace essentials.
            </p>
            <div className="flex gap-4">
              <Link
                to="/products"
                className="inline-flex items-center justify-center px-10 py-4 bg-white text-black font-semibold hover:bg-gray-200 transition-colors uppercase tracking-widest text-xs"
              >
                Shop New Arrivals
              </Link>
              <Link
                to="/products?category=laptops"
                className="inline-flex items-center justify-center px-10 py-4 border border-white/30 text-white font-semibold hover:bg-white/10 transition-colors uppercase tracking-widest text-xs"
              >
                Explore Laptops
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Logos / As Seen On */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="container mx-auto px-6">
          <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-8">
            Curated from industry leaders
          </p>
          <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 opacity-40 grayscale">
            {/* Using text logos for brands as placeholders */}
            <span className="text-2xl font-bold tracking-tighter">APPLE</span>
            <span className="text-xl font-bold tracking-widest uppercase">Sony</span>
            <span className="text-2xl font-bold tracking-tight">logitech</span>
            <span className="text-xl font-black italic">BOSE</span>
            <span className="text-2xl font-light tracking-wide uppercase">Samsung</span>
          </div>
        </div>
      </section>

      {/* Featured Categories Grid */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-end justify-between mb-12">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
                Shop Categories
              </h2>
              <p className="text-gray-500">Curated collections for your specific needs.</p>
            </div>
            <Link
              to="/products"
              className="text-gray-900 font-semibold flex items-center gap-2 hover:opacity-70 transition-opacity mt-4 md:mt-0 uppercase tracking-widest text-xs"
            >
              View All Categories <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-auto md:h-[600px]">
            {/* Large Category */}
            <Link
              to="/products?category=laptops"
              className="group relative md:col-span-8 bg-gray-100 overflow-hidden h-96 md:h-full"
            >
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors z-10 duration-500"></div>
              <img
                src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
                alt="Laptops"
                className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute bottom-0 left-0 p-10 z-20">
                <span className="text-white/80 text-xs font-bold uppercase tracking-widest mb-2 block">
                  Collection
                </span>
                <h3 className="text-4xl font-bold text-white mb-4">Laptops & Desktops</h3>
                <span className="inline-flex items-center justify-center px-6 py-3 bg-white text-black font-semibold text-xs uppercase tracking-widest group-hover:bg-gray-100 transition-colors">
                  Explore
                </span>
              </div>
            </Link>

            {/* Smaller Categories */}
            <div className="md:col-span-4 grid grid-rows-2 gap-4 h-full">
              <Link
                to="/products?category=audio"
                className="group relative bg-gray-100 overflow-hidden h-64 md:h-full"
              >
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors z-10 duration-500"></div>
                <img
                  src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
                  alt="Audio"
                  className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute bottom-0 left-0 p-8 z-20 w-full">
                  <h3 className="text-2xl font-bold text-white mb-2">Premium Audio</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-semibold uppercase tracking-widest">
                      Shop Now
                    </span>
                    <ChevronRight className="text-white w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
              <Link
                to="/products?category=accessories"
                className="group relative bg-gray-100 overflow-hidden h-64 md:h-full"
              >
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors z-10 duration-500"></div>
                <img
                  src="https://images.unsplash.com/photo-1572569433114-699257f86488?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
                  alt="Accessories"
                  className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute bottom-0 left-0 p-8 z-20 w-full">
                  <h3 className="text-2xl font-bold text-white mb-2">Workspace Accessories</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-semibold uppercase tracking-widest">
                      Shop Now
                    </span>
                    <ChevronRight className="text-white w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* New Arrivals Row */}
      <section className="py-20 bg-gray-50 border-t border-gray-200">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">New Arrivals</h2>
            <Link
              to="/products"
              className="text-gray-900 font-semibold flex items-center gap-2 hover:opacity-70 uppercase tracking-widest text-xs"
            >
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
            {newArrivals.length > 0 ? (
              newArrivals.map((product) => (
                <Link
                  key={product.productId}
                  to={`/products/${product.productId}`}
                  className="group block"
                >
                  <div className="aspect-[4/5] bg-gray-100 mb-4 overflow-hidden relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-200 group-hover:scale-105 transition-transform duration-700">
                        <span className="font-mono text-xs tracking-widest uppercase">
                          No Image
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300"></div>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1 group-hover:underline">
                    {product.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-2 line-clamp-1">{product.description}</p>
                  <p className="text-base font-semibold text-gray-900">
                    ${product.price.toFixed(2)}
                  </p>
                </Link>
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-gray-500 font-mono text-sm">
                LOADING NEW ARRIVALS...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Editorial Split Banner */}
      <section className="bg-black text-white">
        <div className="flex flex-col md:flex-row">
          <div className="md:w-1/2 p-12 md:p-24 flex flex-col justify-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              The Studio Display
            </h2>
            <p className="text-gray-400 text-lg mb-8 font-light max-w-md">
              A mesmerizing 27-inch 5K Retina display that draws you in. A 12MP Ultra Wide camera
              with Center Stage. And studio-quality mics.
            </p>
            <div>
              <Link
                to="/products"
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-black font-semibold hover:bg-gray-200 transition-colors uppercase tracking-widest text-xs"
              >
                Discover More
              </Link>
            </div>
          </div>
          <div className="md:w-1/2 h-[400px] md:h-auto">
            <img
              src="https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
              alt="Macbook Pro"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Trending Now */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 tracking-tight text-center">
              Trending Right Now
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {trendingProducts.length > 0 ? (
              trendingProducts.map((product) => (
                <Link
                  key={product.productId}
                  to={`/products/${product.productId}`}
                  className="group block relative"
                >
                  <div className="aspect-square bg-gray-100 mb-6 overflow-hidden relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover mix-blend-multiply group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-100 group-hover:scale-105 transition-transform duration-700">
                        <span className="font-mono text-xs tracking-widest uppercase">
                          No Image
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-bold text-gray-900 mb-1 group-hover:underline uppercase tracking-wide">
                      {product.name}
                    </h3>
                    <p className="text-sm font-semibold text-gray-500">
                      ${product.price.toFixed(2)}
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-gray-500 font-mono text-sm">
                LOADING TRENDING PRODUCTS...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Newsletter Signup */}
      <section className="py-24 bg-gray-50 border-t border-gray-200">
        <div className="container mx-auto px-6 max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Join The List</h2>
          <p className="text-gray-500 mb-8 font-light">
            Sign up for our newsletter to receive exclusive offers, early access to new drops, and
            the latest tech news.
          </p>
          <form className="flex flex-col sm:flex-row gap-4" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="Enter your email address"
              className="flex-1 px-6 py-4 border border-gray-300 focus:outline-none focus:border-gray-900 transition-colors rounded-none"
              required
            />
            <button
              type="submit"
              className="px-10 py-4 bg-gray-900 text-white font-semibold hover:bg-black transition-colors uppercase tracking-widest text-xs rounded-none whitespace-nowrap"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>

      {/* Refined Trust Badges */}
      <section className="py-12 bg-white border-t border-gray-200">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center py-4 px-4">
              <Truck className="w-6 h-6 text-gray-900 mb-4" strokeWidth={1} />
              <h3 className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-widest">
                Free Global Shipping
              </h3>
              <p className="text-sm text-gray-500 font-light">On all orders over $150</p>
            </div>
            <div className="flex flex-col items-center py-4 px-4 border-t md:border-t-0 md:border-l border-gray-200">
              <RefreshCw className="w-6 h-6 text-gray-900 mb-4" strokeWidth={1} />
              <h3 className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-widest">
                30-Day Returns
              </h3>
              <p className="text-sm text-gray-500 font-light">No questions asked</p>
            </div>
            <div className="flex flex-col items-center py-4 px-4 border-t md:border-t-0 md:border-l border-gray-200">
              <ShieldCheck className="w-6 h-6 text-gray-900 mb-4" strokeWidth={1} />
              <h3 className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-widest">
                Secure Checkout
              </h3>
              <p className="text-sm text-gray-500 font-light">100% encrypted payment</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
