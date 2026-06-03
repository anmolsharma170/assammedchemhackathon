'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { convertQuantity, CONVERSIONS } from '@/lib/conversions';

export default function CustomerDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  
  // Products Catalog State
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('All');
  const [categories, setCategories] = useState([]);
  
  // Calculator / Add-to-cart Workspace State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [calcQty, setCalcQty] = useState('');
  const [calcUnit, setCalcUnit] = useState('');
  const [calcConvertedQty, setCalcConvertedQty] = useState(0);
  const [calcTotalPrice, setCalcTotalPrice] = useState(0);
  
  // Cart state
  const [cart, setCart] = useState([]);
  
  // Orders History State
  const [orders, setOrders] = useState([]);
  
  // UI Notification States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  // Load Session, Products, and History
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

  // Triggered when a customer selects a product to calculate
  const selectProductForCalc = (product) => {
    setSelectedProduct(product);
    setCalcQty('1');
    setCalcUnit(product.base_unit);
    runLiveConversion('1', product.base_unit, product);
  };

  // Run live conversion as user types or changes unit
  const handleCalcQtyChange = (e) => {
    const value = e.target.value;
    setCalcQty(value);
    runLiveConversion(value, calcUnit, selectedProduct);
  };

  const handleCalcUnitChange = (e) => {
    const unit = e.target.value;
    setCalcUnit(unit);
    runLiveConversion(calcQty, unit, selectedProduct);
  };

  const runLiveConversion = (qtyStr, unit, product) => {
    if (!product) return;
    
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      setCalcConvertedQty(0);
      setCalcTotalPrice(0);
      return;
    }

    try {
      const converted = convertQuantity(qty, unit, product.base_unit, product.dimension);
      const total = converted * parseFloat(product.base_price);
      setCalcConvertedQty(converted);
      setCalcTotalPrice(total);
    } catch (err) {
      console.error(err);
      setCalcConvertedQty(0);
      setCalcTotalPrice(0);
    }
  };

  // Add calculated item to quotation cart
  const handleAddToCart = (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const qty = parseFloat(calcQty);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid positive quantity');
      return;
    }

    // Verify inventory availability locally (without exposing exact number)
    const existingInCart = cart.find(item => item.productId === selectedProduct.id);
    const existingConvertedQty = existingInCart ? existingInCart.convertedQuantity : 0;
    const totalRequestedConverted = calcConvertedQty + existingConvertedQty;

    if (totalRequestedConverted > parseFloat(selectedProduct.inventory)) {
      setError(`Cannot add to cart: Requested quantity is currently unavailable in our warehouse stock.`);
      return;
    }

    if (existingInCart) {
      // Update existing item
      setCart(cart.map(item => {
        if (item.productId === selectedProduct.id) {
          const newQty = item.orderedQuantity + qty;
          const newConverted = convertQuantity(newQty, item.orderedUnit, selectedProduct.base_unit, selectedProduct.dimension);
          return {
            ...item,
            orderedQuantity: newQty,
            convertedQuantity: newConverted,
            itemTotalPrice: newConverted * parseFloat(selectedProduct.base_price)
          };
        }
        return item;
      }));
    } else {
      // Add new item
      setCart([...cart, {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        orderedQuantity: qty,
        orderedUnit: calcUnit,
        convertedQuantity: calcConvertedQty,
        baseUnit: selectedProduct.base_unit,
        dimension: selectedProduct.dimension,
        pricePerBaseUnit: parseFloat(selectedProduct.base_price),
        itemTotalPrice: calcTotalPrice
      }]);
    }

    setSuccess(`Added ${qty} ${calcUnit} of ${selectedProduct.name} to cart.`);
    setSelectedProduct(null); // Clear active calculator
    setCalcQty('');
    setCalcUnit('');
  };

  const handleRemoveFromCart = (productId) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  // Submit cart as new quotation/order
  const handleSubmitQuotation = async () => {
    setError('');
    setSuccess('');

    if (cart.length === 0) {
      setError('Your cart is empty');
      return;
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(item => ({
            productId: item.productId,
            orderedQuantity: item.orderedQuantity,
            orderedUnit: item.orderedUnit
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit quotation');
      }

      setSuccess('Quotation request submitted successfully!');
      setCart([]); // Clear cart
      fetchProducts(); // Refresh products inventory
      fetchOrders(); // Refresh orders history
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

  const cartTotal = cart.reduce((acc, item) => acc + item.itemTotalPrice, 0);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <h2 style={{ color: 'var(--accent-primary)' }}>Loading Customer Workspace...</h2>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🧪</div>
          AasaMedChem <span style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', marginLeft: '0.25rem' }}>Customer Workspace</span>
        </div>
        <div className="user-badge">
          {currentUser && (
            <>
              <span className="role-pill user" style={{ background: '#f3f4f6', color: 'var(--text-secondary)', border: '1px solid var(--border-muted)' }}>Customer</span>
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
        {/* Customer Workspace Guide */}
        <div style={{ padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem', lineHeight: '1.5' }}>
          💡 <strong>Customer Workspace Guide</strong>: Select a chemical from our catalog and click <strong>Request Quote</strong>. 
          Use the quote calculator on the right to enter your custom purchase quantity. You can specify it in any unit (e.g. grams vs kilograms) to calculate costs. When ready, submit your quotation cart for Administrator review.
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

        <div className="grid-sidebar">
          
          {/* Left Column: Product Selection Grid */}
          <div className="glass-panel" style={{ minWidth: '0' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2>Chemical Products Catalog</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Browse catalog items, enter customized quantities, and request quotations.</p>
            </div>

            {/* Filter controls */}
            <div className="search-filter-bar">
              <input
                type="text"
                className="form-control"
                placeholder="Search products by name or SKU..."
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
                    <th>Standard Price</th>
                    <th>Availability</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        No chemicals match filters.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => {
                      const isOutOfStock = parseFloat(p.inventory) <= 0;
                      return (
                        <tr key={p.id}>
                          <td className="data-num" style={{ color: 'var(--accent-primary)' }}>{p.sku}</td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{p.name}</div>
                            {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.description}</div>}
                          </td>
                          <td>{p.category}</td>
                          <td className="data-num currency-inr">
                            {parseFloat(p.base_price).toFixed(2)} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/{p.base_unit}</span>
                          </td>
                          {/* Hide raw stock number from external customers, only show flat status */}
                          <td style={{ fontWeight: '500', color: isOutOfStock ? 'var(--color-danger)' : 'var(--color-success)' }}>
                            {isOutOfStock ? 'Out of Stock' : 'In Stock'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => selectProductForCalc(p)}
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                              disabled={isOutOfStock}
                            >
                              Request Quote
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Calculator and Cart Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Conversion Calculator workspace */}
            {selectedProduct && (
              <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
                <h3>Quotation Calculator</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Product: <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct.name}</strong> ({selectedProduct.sku})<br />
                  Catalog Unit: <code>{selectedProduct.base_unit}</code> | Price: <span className="currency-inr">{parseFloat(selectedProduct.base_price).toFixed(2)}</span>
                </p>

                <form onSubmit={handleAddToCart}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label">Order Quantity</label>
                      <input
                        type="number"
                        step="0.00000001"
                        className="form-control data-num"
                        value={calcQty}
                        onChange={handleCalcQtyChange}
                        placeholder="e.g. 500"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Order Unit</label>
                      <select
                        className="form-select"
                        value={calcUnit}
                        onChange={handleCalcUnitChange}
                      >
                        {Object.keys(CONVERSIONS[selectedProduct.dimension]).map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Calculations Preview Audit Panel */}
                  <div className="conversion-audit-box" style={{ marginBottom: '1.25rem' }}>
                    <h5>Live Conversion Preview</h5>
                    
                    {calcUnit !== selectedProduct.base_unit ? (
                      <p>
                        Unit Conversion: <code>{calcQty || '0'} {calcUnit}</code> matches <code>{calcConvertedQty.toFixed(4)} {selectedProduct.base_unit}</code>.
                      </p>
                    ) : (
                      <p>No conversion required (matches catalog unit).</p>
                    )}
                    
                    <p style={{ marginTop: '0.2rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                      Estimated Quote: <code>{calcConvertedQty.toFixed(4)} × ₹{parseFloat(selectedProduct.base_price).toFixed(2)} = </code>
                      <span className="currency-inr" style={{ color: 'var(--color-success)', fontSize: '0.95rem', fontWeight: '700' }}>{calcTotalPrice.toFixed(2)}</span>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: '1', fontSize: '0.85rem', padding: '0.5rem' }}>
                      Add to Cart
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedProduct(null)} style={{ fontSize: '0.85rem', padding: '0.5rem' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Cart Panel */}
            <div className="glass-panel">
              <h3>Quotation Cart</h3>
              
              {cart.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem' }}>
                  No items added. Click "Request Quote" on any product.
                </p>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map(item => (
                      <div key={item.productId} className="cart-item">
                        <div className="cart-item-info">
                          <h4>{item.productName}</h4>
                          <p className="data-num">
                            {item.orderedQuantity} {item.orderedUnit}
                            {item.orderedUnit !== item.baseUnit && ` (${item.convertedQuantity.toFixed(2)} ${item.baseUnit})`}
                          </p>
                        </div>
                        <div className="cart-item-actions">
                          <span className="data-num currency-inr" style={{ fontWeight: '600' }}>
                            {item.itemTotalPrice.toFixed(2)}
                          </span>
                          <button
                            onClick={() => handleRemoveFromCart(item.productId)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.1rem' }}
                            title="Remove item"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="cart-total">
                    <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Estimated Total</span>
                    <span className="data-num currency-inr" style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {cartTotal.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handleSubmitQuotation}
                    className="btn btn-indigo"
                    style={{ width: '100%', marginTop: '1rem' }}
                  >
                    Submit Quotation Request
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Order History Section */}
        <div className="glass-panel" style={{ marginTop: '2rem' }}>
          <h2>My Quotation Requests</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Track the status of your submitted requests.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
            {orders.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                You have not submitted any quotation requests yet.
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="glass-panel" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '700' }}>Request #{order.id}</span>
                    <span className={`badge badge-${order.status}`}>{order.status}</span>
                  </div>
                  
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Placed: {new Date(order.createdAt).toLocaleString()}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {order.items.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>
                          {item.productName} ({item.orderedQuantity} {item.orderedUnit})
                        </span>
                        <span className="data-num currency-inr" style={{ color: 'var(--text-secondary)' }}>
                          {item.itemTotalPrice.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Cost</span>
                    <span className="data-num currency-inr" style={{ fontWeight: '700' }}>
                      {order.totalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
