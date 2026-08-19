import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Product } from '../api/catalogue';
import { getProducts } from '../api/catalogue';
import { useCart } from '../cart/CartProvider';
import { Filter, ChevronDown } from 'lucide-react';

const CATEGORIES = ['Audio', 'Wearables', 'Accessories', 'Laptops', 'Storage'];

const PRICE_RANGES = [
  { label: 'All Prices', min: 0, max: Infinity },
  { label: 'Under $100', min: 0, max: 100 },
  { label: '$100 - $500', min: 100, max: 500 },
  { label: 'Over $500', min: 500, max: Infinity },
];

const SORT_OPTIONS = [
  { label: 'Featured', value: 'featured' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Newest', value: 'newest' },
];

export const Catalogue: React.FC = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter States
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPrice, setSelectedPrice] = useState(PRICE_RANGES[0]!);
  const [sortBy, setSortBy] = useState('featured');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const { addToCart } = useCart();
  const location = useLocation();

  useEffect(() => {
    getProducts()
      .then((data) => {
        // the backend returns { success: true, data: Product[], requestId: "..." }
        // BUT wait, getProducts() in api/catalogue.ts already returns Promise<Product[]> because fetchWithAuth probably unwraps it, or does it? Let's assume fetchWithAuth unwraps it. Wait, previously I had to use data.data in Home.tsx because it didn't use fetchWithAuth, it used raw fetch! Yes, Home.tsx used raw fetch. Catalogue uses getProducts() which uses fetchWithAuth.
        setAllProducts(Array.isArray(data) ? data : (data as any).data || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Sync with URL search params if present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const categoryQuery = params.get('category')?.toLowerCase();
    if (categoryQuery) {
      const match = CATEGORIES.find(c => c.toLowerCase() === categoryQuery);
      if (match && !selectedCategories.includes(match)) {
        setSelectedCategories([match]);
      }
    }
  }, [location.search]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...allProducts];

    // 1. Search Query from URL
    const params = new URLSearchParams(location.search);
    const searchQuery = params.get('search')?.toLowerCase();
    if (searchQuery) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery) ||
          (p.description && p.description.toLowerCase().includes(searchQuery)),
      );
    }

    // 2. Category Filter (derive by matching category name against product name/description)
    if (selectedCategories.length > 0) {
      result = result.filter(p => {
        const text = `${p.name} ${p.description || ''}`.toLowerCase();
        return selectedCategories.some(cat => text.includes(cat.toLowerCase()));
      });
    }

    // 3. Price Filter
    if (selectedPrice.max !== Infinity || selectedPrice.min !== 0) {
      result = result.filter(p => p.price >= selectedPrice.min && p.price <= selectedPrice.max);
    }

    // 4. Sorting
    switch (sortBy) {
      case 'price_asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      default:
        // 'featured' - keep API order
        break;
    }

    return result;
  }, [allProducts, location.search, selectedCategories, selectedPrice, sortBy]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-sm uppercase tracking-wider text-gray-400">
        Loading Catalogue...
      </div>
    );
  
  if (error) 
    return <div className="text-center text-red-600 py-20 text-sm">Error: {error}</div>;

  return (
    <div className="bg-white min-h-screen">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight uppercase">The Collection</h1>
          <p className="text-sm text-gray-500 mt-4 max-w-2xl mx-auto">
            Discover our meticulously curated selection of premium electronics. Designed for aesthetics. Engineered for performance.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-200 pb-6 mb-8">
          <div className="flex items-center justify-between w-full md:w-auto mb-4 md:mb-0">
            <button 
              className="md:hidden flex items-center text-sm font-semibold uppercase tracking-wider text-gray-900"
              onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
            >
              <Filter className="w-4 h-4 mr-2" /> Filters
            </button>
            <span className="text-sm text-gray-500 font-medium">
              {filteredAndSortedProducts.length} Results
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 font-medium">Sort by:</span>
            <div className="relative">
              <select 
                className="appearance-none bg-transparent text-sm font-semibold text-gray-900 pr-8 py-1 cursor-pointer focus:outline-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-900 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-12">
          {/* Sidebar Filters */}
          <div className={`w-full md:w-64 flex-shrink-0 ${isMobileFiltersOpen ? 'block' : 'hidden md:block'}`}>
            {/* Categories */}
            <div className="mb-10">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-900 mb-4">Category</h3>
              <div className="space-y-3">
                {CATEGORIES.map(category => (
                  <label key={category} className="flex items-center group cursor-pointer">
                    <div className={`w-4 h-4 border flex items-center justify-center transition-colors ${selectedCategories.includes(category) ? 'bg-black border-black' : 'border-gray-300 group-hover:border-black'}`}>
                      {selectedCategories.includes(category) && (
                        <svg className="w-3 h-3 text-white fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
                      )}
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleCategory(category)}
                    />
                    <span className={`ml-3 text-sm transition-colors ${selectedCategories.includes(category) ? 'text-black font-medium' : 'text-gray-600 group-hover:text-black'}`}>
                      {category}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-900 mb-4">Price</h3>
              <div className="space-y-3">
                {PRICE_RANGES.map((range, idx) => (
                  <label key={idx} className="flex items-center group cursor-pointer">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${selectedPrice.label === range.label ? 'border-black' : 'border-gray-300 group-hover:border-black'}`}>
                      {selectedPrice.label === range.label && (
                        <div className="w-2 h-2 rounded-full bg-black" />
                      )}
                    </div>
                    <input 
                      type="radio" 
                      name="price"
                      className="hidden"
                      checked={selectedPrice.label === range.label}
                      onChange={() => setSelectedPrice(range)}
                    />
                    <span className={`ml-3 text-sm transition-colors ${selectedPrice.label === range.label ? 'text-black font-medium' : 'text-gray-600 group-hover:text-black'}`}>
                      {range.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1">
            {filteredAndSortedProducts.length === 0 ? (
              <div className="text-center py-24 bg-gray-50 border border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-2">No matches found</h3>
                <p className="text-sm text-gray-500">We couldn't find any products matching your current filters. Try adjusting your selections.</p>
                <button 
                  onClick={() => { setSelectedCategories([]); setSelectedPrice(PRICE_RANGES[0]!); }}
                  className="mt-6 text-sm font-semibold uppercase tracking-wider text-black border-b border-black pb-1 hover:text-gray-600 hover:border-gray-600 transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
                {filteredAndSortedProducts.map((product) => (
                  <div key={product.productId} className="group flex flex-col">
                    <Link to={`/products/${product.productId}`} className="block relative">
                      <div className="aspect-[4/5] bg-gray-50 overflow-hidden mb-4 relative">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <span className="text-gray-300 text-xs font-mono">No image</span>
                          </div>
                        )}
                        {/* Hover Overlay Action */}
                        <div className="absolute inset-x-0 bottom-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              addToCart(product);
                            }}
                            className="w-full bg-white/90 backdrop-blur text-black py-3 text-xs font-semibold uppercase tracking-widest hover:bg-black hover:text-white transition-colors shadow-sm"
                          >
                            Quick Add
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-start">
                        <h3 className="text-sm font-medium text-gray-900 pr-4">
                          {product.name}
                        </h3>
                        <p className="text-sm text-gray-900 font-semibold whitespace-nowrap">
                          ${product.price.toFixed(2)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider truncate w-4/5">
                        {product.description || 'Premium Quality'}
                      </p>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
