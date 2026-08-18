import React, { useEffect, useState } from 'react';
import type { Product } from '../../api/catalogue';
import { getProducts } from '../../api/catalogue';

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="text-center py-20 text-sm uppercase tracking-wider text-gray-400">
        Loading products...
      </div>
    );

  return (
    <div className="bg-white">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-12 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Manage Products</h1>
            <p className="text-sm text-gray-500 mt-2">
              {products.length} {products.length === 1 ? 'product' : 'products'}
            </p>
          </div>
          <button className="bg-black text-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors">
            Add Product
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="border border-gray-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">ID</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Price</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product) => (
                <tr key={product.productId} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-xs font-mono text-gray-400">
                    {product.productId.substring(0, 8)}...
                  </td>
                  <td className="p-4 font-semibold text-sm text-gray-900">{product.name}</td>
                  <td className="p-4 text-sm text-gray-900">
                    ${product.price.toFixed(2)} {product.currency}
                  </td>
                  <td className="p-4">
                    <button className="text-gray-900 hover:underline mr-4 text-xs font-semibold uppercase tracking-wider">
                      Edit
                    </button>
                    <button className="text-red-600 hover:underline text-xs font-semibold uppercase tracking-wider">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
