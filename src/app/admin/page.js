'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  
  // Products state
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('All');
  const [categories, setCategories] = useState([]);
  
  // Orders state
  const [orders, setOrders] = useState([]);
  
  // UI States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    category: '',
    dimension: 'weight',
    base_unit: 'g',
    base_price: '',
    inventory: ''
  });

  // Load User, Products and Orders
  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      if (!data.user) {
        router.push('/login');
        return;
      }
      setCurrentUser(data.user);
      fetchProducts();
      fetchOrders();
    } catch (err) {
      console.error(err);
      setError('Failed to fetch session');
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        
        // Extract categories
        const cats = ['All', ...new Set((data.products || []).map(p => p.category))];
        setCategories(cats);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load products');
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to load orders');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth', { method: 'DELETE' });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setError('Logout failed');
    }
  };

  // Dimension -> Unit validation options
  const unitOptions = {
    weight: ['g', 'kg'],
    volume: ['mL', 'L'],
    count: ['items']
  };

  const handleDimensionChange = (e) => {
    const dimension = e.target.value;
    const defaultUnit = unitOptions[dimension][0];
    setFormData(prev => ({
      ...prev,
      dimension,
      base_unit: defaultUnit
    }));
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      sku: '',
      description: '',
      category: '',
      dimension: 'weight',
      base_unit: 'g',
      base_price: '',
      inventory: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      description: product.description || '',
      category: product.category || '',
      dimension: product.dimension,
      base_unit: product.base_unit,
      base_price: parseFloat(product.base_price),
      inventory: parseFloat(product.inventory)
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
    const method = editingProduct ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Operation failed');
      }

      setSuccess(editingProduct ? 'Product updated successfully!' : 'Product added successfully!');
      setIsModalOpen(false);
      fetchProducts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete product');
      }

      setSuccess('Product deleted successfully');
      fetchProducts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update status');
      }

      setSuccess(`Order #${orderId} has been ${newStatus}`);
      fetchOrders();
      fetchProducts(); // Refresh products inventory
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                          p.sku.toLowerCase().includes(productSearch.toLowerCase());
    const matchesCategory = productCategory === 'All' || p.category === productCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <h2 style={{ color: 'var(--accent-teal)' }}>Loading Administrator Dashboard...</h2>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🧪</div>
          AasaMedChem <span style={{ fontSize: '0.9rem', color: 'var(--accent-teal)', marginLeft: '0.25rem' }}>Admin Control</span>
        </div>
        <div className="user-badge">
          {currentUser && (
            <>
              <span className="role-pill admin">Admin</span>
              <span style={{ fontWeight: '500' }}>{currentUser.name}</span>
            </>
          )}
          <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            Logout
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="app-container">
        {/* Admin Workspace Guide */}
        <div style={{ padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem', lineHeight: '1.5' }}>
          💡 <strong>Administrator Workspace</strong>: Manage the chemical and equipment catalog (create products, update base prices, adjust inventory) and process incoming quotations. 
          <span style={{ display: 'block', marginTop: '0.25rem', fontWeight: '600' }}>
            * Operational Note: Rejecting a quotation automatically returns the reserved quantities back into active catalog stock.
          </span>
        </div>
        {/* Flash Messages */}
        {error && (
          <div className="alert-toast alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="alert-toast alert-success" style={{ marginBottom: '1.5rem' }}>
            <span>✓</span>
            <span>{success}</span>
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="grid-sidebar">
          
          {/* Left Column: Product Management */}
          <div className="glass-panel" style={{ minWidth: '0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2>Chemical & Product Catalog</h2>
              <button onClick={openAddModal} className="btn btn-primary">
                + Add New Product
              </button>
            </div>

            {/* Filter controls */}
            <div className="search-filter-bar">
              <input
                type="text"
                className="form-control"
                placeholder="Search by Name or SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ flex: '2' }}
              />
              <select
                className="form-select"
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                style={{ flex: '1' }}
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Dimension</th>
                    <th>Base Rate</th>
                    <th>Inventory</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        No products match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => {
                      const isLowStock = parseFloat(p.inventory) < 10;
                      return (
                        <tr key={p.id}>
                          <td className="data-num" style={{ color: 'var(--accent-teal)' }}>{p.sku}</td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{p.name}</div>
                            {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.description}</div>}
                          </td>
                          <td>{p.category}</td>
                          <td style={{ textTransform: 'capitalize' }}>{p.dimension}</td>
                          <td className="data-num currency-inr">
                            {parseFloat(p.base_price).toFixed(2)} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/{p.base_unit}</span>
                          </td>
                          <td className={`data-num ${isLowStock ? 'low-inventory' : ''}`}>
                            {parseFloat(p.inventory).toFixed(2)} {p.base_unit}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                              <button onClick={() => openEditModal(p)} className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}>
                                Edit
                              </button>
                              <button onClick={() => handleDeleteProduct(p.id)} className="btn btn-danger" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Order Quotation Queue */}
          <div className="glass-panel" style={{ minWidth: '0' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2>Quotation Queue</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Process orders and verify chemical unit conversions.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem' }}>
                  No quotations submitted yet.
                </div>
              ) : (
                orders.map(order => (
                  <div key={order.id} className="glass-panel glow-accent" style={{ padding: '1.25rem', borderLeft: '4px solid var(--accent-indigo)' }}>
                    {/* Order header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span style={{ fontWeight: '700', color: '#ffffff' }}>Order #{order.id}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                          by {order.sellerName}
                        </span>
                      </div>
                      <span className={`badge badge-${order.status}`}>{order.status}</span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      Submitted: {new Date(order.createdAt).toLocaleString()}
                    </div>

                    {/* Order items and audit */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                      {order.items.map(item => {
                        const needsConversion = item.orderedUnit !== item.baseUnit;
                        return (
                          <div key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                              <span style={{ fontWeight: '600' }}>{item.productName}</span>
                              <span className="data-num currency-inr">{item.itemTotalPrice.toFixed(2)}</span>
                            </div>
                            
                            {/* Detailed unit audit display */}
                            <div className="conversion-audit-box">
                              <h5>Conversion & Calculation Audit</h5>
                              <p>
                                Ordered Quantity: <code>{item.orderedQuantity} {item.orderedUnit}</code>
                              </p>
                              {needsConversion ? (
                                <p>
                                  Converted: <code>{item.convertedQuantity.toFixed(4)} {item.baseUnit}</code> 
                                  <span style={{ color: 'var(--accent-teal)' }}> (Unit conversion active)</span>
                                </p>
                              ) : (
                                <p>No conversion needed (matches base unit)</p>
                              )}
                              <p>
                                Base Rate: <code>₹{item.pricePerBaseUnit.toFixed(2)} per {item.baseUnit}</code>
                              </p>
                              <p style={{ marginTop: '0.2rem', fontSize: '0.8rem', color: '#ffffff' }}>
                                Calculation: <code>{item.convertedQuantity.toFixed(4)} {item.baseUnit} × ₹{item.pricePerBaseUnit.toFixed(2)} = ₹{item.itemTotalPrice.toFixed(2)}</code>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Order Footer & Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid var(--border-muted)', paddingTop: '0.75rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Price</span>
                        <div className="data-num currency-inr" style={{ fontSize: '1.25rem', fontWeight: '700' }}>
                          {order.totalPrice.toFixed(2)}
                        </div>
                      </div>

                      {order.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => handleUpdateOrderStatus(order.id, 'approved')} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                            Approve
                          </button>
                          <button onClick={() => handleUpdateOrderStatus(order.id, 'rejected')} className="btn btn-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                            Reject
                          </button>
                        </div>
                      )}
                      
                      {order.status !== 'pending' && (
                        <button 
                          onClick={() => handleUpdateOrderStatus(order.id, 'pending')} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        >
                          Revert to Pending
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Product CRUD Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="name">Product Name</label>
                  <input
                    id="name"
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Sodium Chloride"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="sku">SKU Code</label>
                  <input
                    id="sku"
                    type="text"
                    className="form-control"
                    value={formData.sku}
                    onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="e.g. CHEM-NACL-001"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="description">Description</label>
                <textarea
                  id="description"
                  className="form-control"
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description..."
                ></textarea>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="category">Category</label>
                  <input
                    id="category"
                    type="text"
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g. Reagents, Glassware"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label" htmlFor="dimension">Dimension</label>
                  <select
                    id="dimension"
                    className="form-select"
                    value={formData.dimension}
                    onChange={handleDimensionChange}
                  >
                    <option value="weight">Weight</option>
                    <option value="volume">Volume</option>
                    <option value="count">Count (Units)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1.2fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="base_unit">Base Unit</label>
                  <select
                    id="base_unit"
                    className="form-select"
                    value={formData.base_unit}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_unit: e.target.value }))}
                  >
                    {unitOptions[formData.dimension].map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="base_price">Base Price (INR)</label>
                  <input
                    id="base_price"
                    type="number"
                    step="0.00000001"
                    className="form-control data-num"
                    value={formData.base_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, base_price: e.target.value }))}
                    placeholder="Rate per base unit"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="inventory">Stock Level</label>
                  <input
                    id="inventory"
                    type="number"
                    step="0.00000001"
                    className="form-control data-num"
                    value={formData.inventory}
                    onChange={(e) => setFormData(prev => ({ ...prev, inventory: e.target.value }))}
                    placeholder="Initial stock"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
