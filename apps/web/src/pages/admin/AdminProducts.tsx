import React, { useEffect, useState } from 'react';
import type { Product } from '../../api/catalogue';
import { getProducts, createProduct, updateProduct, deleteProduct, getUploadUrl, uploadFileToS3 } from '../../api/catalogue';
import { getInventory, setInventory } from '../../api/inventory';
import toast from 'react-hot-toast';

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    currency: 'USD',
    imageUrl: '',
    quantity: '0',
  });

  const fetchProducts = () => {
    setLoading(true);
    getProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenModal = async (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        currency: product.currency,
        imageUrl: product.imageUrl || '',
        quantity: '0', 
      });
      setIsModalOpen(true);
      
      try {
        const inv = await getInventory(product.productId);
        setFormData(prev => ({ ...prev, quantity: inv.stockLevel.toString() }));
      } catch (err) {
        console.warn('Could not load inventory:', err);
      }
    } else {
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: '', currency: 'USD', imageUrl: '', quantity: '0' });
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        currency: formData.currency,
        imageUrl: formData.imageUrl,
      };

        if (editingProduct) {
          await updateProduct(editingProduct.productId, payload);
          await setInventory(editingProduct.productId, parseInt(formData.quantity) || 0);
          toast.success('Product updated successfully');
        } else {
          const newProduct = await createProduct(payload);
          await setInventory(newProduct.productId, parseInt(formData.quantity) || 0);
          toast.success('Product created successfully');
        }
        handleCloseModal();
        fetchProducts();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save product';
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteProduct(id);
        toast.success('Product deleted');
        fetchProducts();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete product';
        toast.error(errorMessage);
      }
    }
  };

  if (loading && products.length === 0)
    return (
      <div className="text-center py-20 text-sm uppercase tracking-wider text-gray-400">
        Loading products...
      </div>
    );

  return (
    <div className="bg-white relative border border-gray-200">
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="px-8 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Manage Products</h1>
            <p className="text-sm text-gray-500 mt-1">
              {products.length} {products.length === 1 ? 'product' : 'products'}
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="bg-black text-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors"
          >
            Add Product
          </button>
        </div>
      </div>

      <div className="p-0">
        <div className="overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  ID
                </th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Price
                </th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </th>
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
                    <button
                      onClick={() => handleOpenModal(product)}
                      className="text-gray-900 hover:underline mr-4 text-xs font-semibold uppercase tracking-wider"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(product.productId)}
                      className="text-red-600 hover:underline text-xs font-semibold uppercase tracking-wider"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500 text-sm">
                    No products found. Add some to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white p-8 max-w-lg w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                  Currency
                </label>
                <input
                  type="text"
                  required
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-500 mb-2">
                  Product Image
                </label>
                <div className="flex gap-4 items-center">
                  {formData.imageUrl && (
                    <img src={formData.imageUrl} alt="Preview" className="w-16 h-16 object-cover border border-gray-200" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      try {
                        setIsUploading(true);
                        toast.loading('Preparing upload...', { id: 'upload' });
                        const { uploadUrl, imageUrl } = await getUploadUrl(file.type);
                        
                        toast.loading('Uploading image...', { id: 'upload' });
                        await uploadFileToS3(uploadUrl, file);
                        
                        setFormData(prev => ({ ...prev, imageUrl }));
                        toast.success('Image uploaded successfully', { id: 'upload' });
                      } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : 'Upload failed';
                        toast.error(errorMessage, { id: 'upload' });
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                    disabled={isUploading}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-widest file:bg-gray-100 file:text-gray-900 hover:file:bg-gray-200 transition-colors disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-4 mt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="bg-black text-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Uploading...' : editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
