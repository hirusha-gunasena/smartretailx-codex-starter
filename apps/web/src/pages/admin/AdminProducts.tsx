import React, { useEffect, useState, useMemo } from 'react';
import type { Product } from '../../api/catalogue';
import { getProducts, createProduct, updateProduct, deleteProduct, getUploadUrl, uploadFileToS3 } from '../../api/catalogue';
import { getInventory, setInventory } from '../../api/inventory';
import toast from 'react-hot-toast';
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Edit2, 
  Trash2, 
  Plus, 
  Package, 
  X,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  Archive
} from 'lucide-react';

interface ProductWithInventory extends Product {
  availableQuantity: number;
}

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [loading, setLoading] = useState(true);

  // Table State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [sortField, setSortField] = useState<'name' | 'price' | 'availableQuantity'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithInventory | null>(null);
  const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false);
  const [bulkQuantity, setBulkQuantity] = useState('0');
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    currency: 'USD',
    imageUrl: '',
    quantity: '0',
  });

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const prods = await getProducts();
      // Fetch inventory for all products to show in table
      const inventoryPromises = prods.map(p => 
        getInventory(p.productId)
          .then(inv => ({ ...p, availableQuantity: inv.availableQuantity }))
          .catch(() => ({ ...p, availableQuantity: 0 }))
      );
      const prodsWithInv = await Promise.all(inventoryPromises);
      setProducts(prodsWithInv);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Filtering, Sorting, and Pagination
  const filteredAndSortedProducts = useMemo(() => {
    let result = products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.productId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' ? true : 
                            statusFilter === 'IN_STOCK' ? p.availableQuantity > 0 : 
                            p.availableQuantity === 0;
      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    return result;
  }, [products, searchQuery, statusFilter, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredAndSortedProducts.length / itemsPerPage);
  const paginatedProducts = filteredAndSortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers
  const handleSort = (field: 'name' | 'price' | 'availableQuantity') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(paginatedProducts.map(p => p.productId)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedIds.size} products?`)) {
      const loadingToast = toast.loading('Deleting products...');
      try {
        await Promise.all(Array.from(selectedIds).map(id => deleteProduct(id)));
        toast.success(`Deleted ${selectedIds.size} products`, { id: loadingToast });
        setSelectedIds(new Set());
        fetchProducts();
      } catch (err) {
        toast.error('Failed to delete some products', { id: loadingToast });
      }
    }
  };

  const handleBulkUpdateQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadingToast = toast.loading('Updating inventory...');
    try {
      const qty = parseInt(bulkQuantity, 10) || 0;
      await Promise.all(Array.from(selectedIds).map(id => setInventory(id, qty)));
      toast.success(`Updated inventory for ${selectedIds.size} products`, { id: loadingToast });
      setIsBulkUpdateModalOpen(false);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err) {
      toast.error('Failed to update inventory', { id: loadingToast });
    }
  };

  const handleOpenModal = (product?: ProductWithInventory) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        price: product.price.toString(),
        currency: product.currency,
        imageUrl: product.imageUrl || '',
        quantity: product.availableQuantity.toString(), 
      });
      setIsModalOpen(true);
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

  // Stats
  const totalProducts = products.length;
  const outOfStockCount = products.filter(p => p.availableQuantity === 0).length;

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 p-6 flex items-center shadow-sm">
          <div className="w-12 h-12 bg-gray-100 flex items-center justify-center mr-4">
            <Package className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Total Products</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalProducts}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 p-6 flex items-center shadow-sm">
          <div className="w-12 h-12 bg-red-50 flex items-center justify-center mr-4">
            <Archive className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Out of Stock</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{outOfStockCount}</p>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="bg-white border border-gray-200 shadow-sm">
        {/* Header & Controls */}
        <div className="p-6 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Product Catalogue</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your store's inventory and listings</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="bg-black text-white px-6 py-2.5 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors flex items-center shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </button>
        </div>

        {/* Filters Bar */}
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white">
          <div className="flex-1 w-full relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search products by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 text-sm focus:outline-none focus:border-black transition-colors"
            />
          </div>
          <div className="flex gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-48">
              <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 text-sm focus:outline-none focus:border-black appearance-none bg-white transition-colors cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar (Shows when items are selected) */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-50 border-b border-blue-100 p-3 px-6 flex justify-between items-center animate-in slide-in-from-top-2">
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setIsBulkUpdateModalOpen(true)}
                className="px-4 py-1.5 bg-white border border-blue-200 text-blue-700 text-xs font-semibold uppercase tracking-wider hover:bg-blue-100 transition-colors shadow-sm"
              >
                Update Stock
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold uppercase tracking-wider hover:bg-red-700 transition-colors shadow-sm"
              >
                Delete Selected
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-200">
                <th className="p-4 w-12">
                  <input
                    type="checkbox"
                    checked={paginatedProducts.length > 0 && selectedIds.size === paginatedProducts.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-black border-gray-300 rounded cursor-pointer accent-black focus:ring-black"
                  />
                </th>
                <th 
                  className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-900 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Product <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th 
                  className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-900 transition-colors"
                  onClick={() => handleSort('availableQuantity')}
                >
                  <div className="flex items-center">
                    Inventory <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
                <th 
                  className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-900 transition-colors"
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center">
                    Price <ArrowUpDown className="w-3 h-3 ml-1" />
                  </div>
                </th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-sm uppercase tracking-wider text-gray-400">
                    Loading products...
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-sm text-gray-500">
                    No products found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => (
                  <tr key={product.productId} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(product.productId) ? 'bg-gray-50' : ''}`}>
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.productId)}
                        onChange={() => handleSelectOne(product.productId)}
                        className="w-4 h-4 text-black border-gray-300 rounded cursor-pointer accent-black focus:ring-black"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-10 h-10 object-cover border border-gray-200" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 border border-gray-200 flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-sm text-gray-900">{product.name}</div>
                          <div className="text-xs font-mono text-gray-400 mt-0.5">{product.productId.substring(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {product.availableQuantity > 0 ? (
                        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 text-green-700 bg-green-50 border border-green-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> In Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 text-red-700 bg-red-50 border border-red-200">
                          <XCircle className="w-3 h-3 mr-1" /> Out of Stock
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-900">
                      {product.availableQuantity} units
                    </td>
                    <td className="p-4 text-sm font-medium text-gray-900">
                      ${product.price.toFixed(2)} <span className="text-gray-400 font-normal">{product.currency}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleOpenModal(product)}
                        className="p-2 text-gray-400 hover:text-gray-900 transition-colors inline-flex"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.productId)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors inline-flex"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedProducts.length)} of {filteredAndSortedProducts.length} entries
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-900 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto">
              <form id="product-form" onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                      Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                      Quantity
                    </label>
                    <input
                      type="number"
                      step="1"
                      required
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Currency
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Product Image
                  </label>
                  <div className="flex gap-4 items-start">
                    {formData.imageUrl && (
                      <img src={formData.imageUrl} alt="Preview" className="w-20 h-20 object-cover border border-gray-200 shadow-sm" />
                    )}
                    <div className="flex-1">
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
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-widest file:bg-black file:text-white hover:file:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                      />
                      <p className="text-xs text-gray-400 mt-2">JPG, PNG, WebP up to 5MB</p>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            
            <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={isUploading}
                className="bg-black text-white px-8 py-2.5 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isUploading ? 'Uploading...' : editingProduct ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Update Modal */}
      {isBulkUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white p-8 max-w-sm w-full shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Update Inventory</h2>
            <p className="text-sm text-gray-500 mb-6">Set the available quantity for {selectedIds.size} products.</p>
            
            <form onSubmit={handleBulkUpdateQuantity}>
              <div className="mb-6">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  New Quantity
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={bulkQuantity}
                  onChange={(e) => setBulkQuantity(e.target.value)}
                  className="w-full border border-gray-200 p-3 text-sm focus:outline-none focus:border-black transition-colors"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsBulkUpdateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-black text-white px-6 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-gray-800 transition-colors shadow-sm"
                >
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
