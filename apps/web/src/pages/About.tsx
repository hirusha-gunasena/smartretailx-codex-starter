import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export const About: React.FC = () => {
  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-4">About SmartRetailX</h1>
          <p className="text-gray-500 max-w-2xl mx-auto">
            We are on a mission to redefine the e-commerce experience by delivering cutting-edge technology directly to your doorstep.
          </p>
        </div>
      </div>

      {/* Our Story */}
      <div className="max-w-4xl mx-auto px-6 py-20">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">Our Story</h2>
        <div className="text-gray-600 leading-relaxed space-y-4">
          <p>
            Founded in 2026, SmartRetailX began with a simple idea: technology shopping should be as seamless, intuitive, and high-quality as the products themselves. Frustrated by cluttered online storefronts and unreliable shipping, our founders set out to build a platform that puts the customer first.
          </p>
          <p>
            Today, we are proud to offer a curated selection of premium electronics, gadgets, and accessories. We partner directly with top-tier manufacturers to ensure that every product meets our rigorous standards for quality and innovation.
          </p>
        </div>
      </div>

      {/* Values */}
      <div className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-12 text-center">
            What We Stand For
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-4">01</div>
              <h3 className="font-bold text-gray-900 mb-3">Premium Quality</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Every item in our catalogue is rigorously tested by our tech experts to ensure exceptional performance.
              </p>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-4">02</div>
              <h3 className="font-bold text-gray-900 mb-3">Customer First</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                We prioritize your experience with 24/7 support, easy returns, and secure payment processing.
              </p>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-4">03</div>
              <h3 className="font-bold text-gray-900 mb-3">Sustainable Future</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                We are committed to eco-friendly packaging and partnering with carbon-neutral delivery networks.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to explore?</h2>
          <p className="text-gray-500 text-sm mb-8">Browse our curated collection of premium technology.</p>
          <Link
            to="/products"
            className="inline-flex items-center bg-black text-white px-8 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
          >
            Shop Now <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </div>
  );
};
