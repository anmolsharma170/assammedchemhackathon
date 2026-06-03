'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { convertQuantity, CONVERSIONS } from '@/lib/conversions';

export default function CustomerDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);

  // Seller listings fetched from /api/seller-inventory
  const [listings, setListings] = useState([]);
  const [selectedSeller, setSelectedSeller] = useState('All');
  const [productSearch, setProductSearch] = useState('');

  // Calculator / Add-to-cart Workspace State
  const [selectedListing, setSelectedListing] = useState(null); // full seller_inventory row
  const [calcQty, setCalcQty] = useState('');
  const [calcUnit, setCalcUnit] = useState('');
  const [calcConvertedQty, setCalcConvertedQty] = useState(0);
  const [calcTotalPrice, setCalcTotalPrice] = useState(0);

  // Cart state — items to buy from a single seller (vendor_id must be same for all)
  const [cart, setCart] = useState([]);
  const [cartVendorId, setCartVendorId] = useState(null);
  const [cartVendorName, setCartVendorName] = useState('');

  // Orders History State
  const [orders, setOrders] = useState([]);

  // UI States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSession(); }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      if (!data.user) { router.push('/login'); return; }
      setCurrentUser(data.user);
      fetchListings();
      fetchOrders();
    } catch (err) {
      console.error(err);
      setError('Failed to fetch session');
      setLoading(false);
    }
  };

  // Fetch all seller listings (products sellers have stocked and are selling)
  const fetchListings = async () => {
    try {
      const res = await fetch('/api/seller-inventory');
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load seller listings');
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
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth', { method: 'DELETE' });
      if (res.ok) { router.push('/login'); router.refresh(); }
    } catch (err) {
      setError('Logout failed');
    }
  };

  // Get unique seller names for filter
  const sellers = ['All', ...new Set(listings.map(l => l.seller_name))];

  // Filter listings by seller and search
  const filteredListings = listings.filter(l => {
    const matchesSeller = selectedSeller === 'All' || l.seller_name === selectedSeller;
    const matchesSearch = l.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          l.sku.toLowerCase().includes(productSearch.toLowerCase());
    return matchesSeller && matchesSearch;
  });

  // When a customer selects a listing to add to cart
  const selectListingForCalc = (listing) => {
    // Enforce single-seller cart: all items must be from the same seller
    if (cart.length > 0 && cartVendorId !== listing.seller_id) {
      setError(`Your cart already has items from ${cartVendorName}. Clear the cart or complete your current order first.`);
      return;
    }
    setSelectedListing(listing);
    setCalcQty('1');
    setCalcUnit(listing.base_unit);
    runLiveConversion('1', listing.base_unit, listing);
    setError('');
  };

  const handleCalcQtyChange = (e) => {
    const value = e.target.value;
    setCalcQty(value);
    runLiveConversion(value, calcUnit, selectedListing);
  };

  const handleCalcUnitChange = (e) => {
    const unit = e.target.value;
    setCalcUnit(unit);
    runLiveConversion(calcQty, unit, selectedListing);
  };

  // Live conversion preview — same convertQuantity() as server
  const runLiveConversion = (qtyStr, unit, listing) => {
    if (!listing) return;
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      setCalcConvertedQty(0);
      setCalcTotalPrice(0);
      return;
    }
    try {
      // Convert ordered unit → base unit (e.g. 2 kg → 2000 g)
      const converted = convertQuantity(qty, unit, listing.base_unit, listing.dimension);
      // Price = converted qty × seller's selling_price (₹/base unit)
      const total = converted * parseFloat(listing.selling_price);
      setCalcConvertedQty(converted);
      setCalcTotalPrice(total);
    } catch (err) {
      console.error(err);
      setCalcConvertedQty(0);
      setCalcTotalPrice(0);
    }
  };

  const handleAddToCart = (e) => {
    e.preventDefault();
    if (!selectedListing) return;

    const qty = parseFloat(calcQty);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid positive quantity');
      return;
    }

    // Local stock check against seller's quantity (base units)
    const existingInCart = cart.find(item => item.productId === selectedListing.product_id);
    const existingConverted = existingInCart ? existingInCart.convertedQuantity : 0;
    const totalConverted = calcConvertedQty + existingConverted;

    if (totalConverted > parseFloat(selectedListing.quantity)) {
      setError(`Requested quantity exceeds seller's available stock (${parseFloat(selectedListing.quantity).toFixed(4)} ${selectedListing.base_unit})`);
      return;
    }

    if (existingInCart) {
      setCart(cart.map(item => {
        if (item.productId === selectedListing.product_id) {
          const newQty = item.orderedQuantity + qty;
          const newConverted = convertQuantity(newQty, item.orderedUnit, selectedListing.base_unit, selectedListing.dimension);
          return {
            ...item,
            orderedQuantity: newQty,
            convertedQuantity: newConverted,
            itemTotalPrice: newConverted * parseFloat(selectedListing.selling_price),
          };
        }
        return item;
      }));
    } else {
      // First item from this seller → lock cart vendor
      setCartVendorId(selectedListing.seller_id);
      setCartVendorName(selectedListing.seller_name);
      setCart([...cart, {
        productId:        selectedListing.product_id,
        productName:      selectedListing.product_name,
        vendorId:         selectedListing.seller_id,
        vendorName:       selectedListing.seller_name,
        orderedQuantity:  qty,
        orderedUnit:      calcUnit,
        convertedQuantity: calcConvertedQty,
        baseUnit:         selectedListing.base_unit,
        dimension:        selectedListing.dimension,
        sellingPrice:     parseFloat(selectedListing.selling_price),
        itemTotalPrice:   calcTotalPrice,
      }]);
    }

    setSuccess(`Added ${qty} ${calcUnit} of ${selectedListing.product_name} to cart.`);
    setSelectedListing(null);
    setCalcQty('');
    setCalcUnit('');
  };

  const handleRemoveFromCart = (productId) => {
    const newCart = cart.filter(item => item.productId !== productId);
    setCart(newCart);
    if (newCart.length === 0) { setCartVendorId(null); setCartVendorName(''); }
  };

  // Submit SALE order — customer buying from the seller's stocked inventory
  const handleSubmitOrder = async () => {
    setError('');
    setSuccess('');
    if (cart.length === 0) { setError('Your cart is empty'); return; }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'sale',           // customer buying from seller
          vendorId:  cartVendorId,     // the seller fulfilling this order
          items: cart.map(item => ({
            productId:       item.productId,
            orderedQuantity: item.orderedQuantity,
            orderedUnit:     item.orderedUnit,
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit order');

      setSuccess(`Order placed successfully from ${cartVendorName}! Total: ₹${data.totalPrice?.toFixed(2)}`);
      setCart([]);
      setCartVendorId(null);
      setCartVendorName('');
      fetchListings(); // refresh available stock
      fetchOrders();
    } catch (err) {
      setError(err.message);
    }
  };

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

      <main className="app-container">
        {/* Guide Banner */}
        <div style={{ padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem', lineHeight: '1.5' }}>
          💡 <strong>Customer Workspace</strong>: Browse chemicals listed by verified sellers.
          Click <strong>Buy from Seller</strong> on any product, enter your quantity, preview the live price, and add it to your cart.
          All items in one order must come from the same seller.
        </div>

        {/* Flash Messages */}
        {error && (
          <div className="alert-toast alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}
        {success && (
          <div className="alert-toast alert-success" style={{ marginBottom: '1.5rem' }}>
            <span>✓</span><span>{success}</span>
          </div>
        )}

        <div className="grid-sidebar">

          {/* Left: Seller Listings Catalog */}
          <div className="glass-panel" style={{ minWidth: '0' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <h2>Seller Listings</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Products available from sellers who have stocked their inventory.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="search-filter-bar">
              <input
                type="text"
                className="form-control"
                placeholder="Search by product name or SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ flex: '2' }}
              />
              <select
                className="form-select"
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                style={{ flex: '1' }}
              >
                {sellers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Seller</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Availability</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListings.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        No seller listings available.
                      </td>
                    </tr>
                  ) : (
                    filteredListings.map(listing => {
                      const outOfStock = parseFloat(listing.quantity) <= 0;
                      const differentSeller = cart.length > 0 && cartVendorId !== listing.seller_id;
                      return (
                        <tr key={listing.id}>
                          <td className="data-num nowrap" style={{ color: 'var(--accent-primary)' }}>{listing.sku}</td>
                          <td style={{ fontWeight: '600' }}>{listing.product_name}</td>
                          <td style={{ color: 'var(--accent-teal)', fontWeight: '500' }}>{listing.seller_name}</td>
                          <td className="nowrap">{listing.category}</td>
                          <td className="data-num currency-inr nowrap">
                            {parseFloat(listing.selling_price).toFixed(2)}
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/{listing.base_unit}</span>
                          </td>
                          <td className="nowrap" style={{ fontWeight: '500', color: outOfStock ? 'var(--color-danger)' : 'var(--color-success)' }}>
                            {outOfStock ? 'Out of Stock' : 'In Stock'}
                          </td>
                          <td className="nowrap" style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => selectListingForCalc(listing)}
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                              disabled={outOfStock || differentSeller}
                              title={differentSeller ? `Cart locked to ${cartVendorName}` : ''}
                            >
                              Buy from Seller
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

          {/* Right: Calculator + Cart */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Calculator */}
            {selectedListing && (
              <div className="glass-panel glow-accent" style={{ borderLeft: '4px solid var(--accent-teal)' }}>
                <h3>Purchase Calculator</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Product: <strong style={{ color: 'var(--text-primary)' }}>{selectedListing.product_name}</strong> ({selectedListing.sku})<br />
                  Seller: <span style={{ color: 'var(--accent-teal)', fontWeight: '600' }}>{selectedListing.seller_name}</span><br />
                  Base Unit: <code>{selectedListing.base_unit}</code> | Seller Price: <span className="currency-inr">{parseFloat(selectedListing.selling_price).toFixed(2)}</span>
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
                      <label className="form-label">Unit</label>
                      <select className="form-select" value={calcUnit} onChange={handleCalcUnitChange}>
                        {Object.keys(CONVERSIONS[selectedListing.dimension]).map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Live Conversion Preview */}
                  <div className="conversion-audit-box" style={{ marginBottom: '1.25rem' }}>
                    <h5>Live Price Preview</h5>
                    {calcUnit !== selectedListing.base_unit ? (
                      <p>
                        Unit Conversion: <code>{calcQty || '0'} {calcUnit}</code> = <code>{calcConvertedQty.toFixed(4)} {selectedListing.base_unit}</code>
                      </p>
                    ) : (
                      <p>No conversion needed (matches seller's base unit).</p>
                    )}
                    <p style={{ marginTop: '0.2rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                      Total: <code>{calcConvertedQty.toFixed(4)} × ₹{parseFloat(selectedListing.selling_price).toFixed(2)} = </code>
                      <span className="currency-inr" style={{ color: 'var(--color-success)', fontSize: '0.95rem', fontWeight: '700' }}>{calcTotalPrice.toFixed(2)}</span>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: '1', fontSize: '0.85rem', padding: '0.5rem' }}>
                      Add to Cart
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedListing(null)} style={{ fontSize: '0.85rem', padding: '0.5rem' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Cart */}
            <div className="glass-panel">
              <h3>Order Cart</h3>
              {cartVendorName && (
                <p style={{ fontSize: '0.8rem', color: 'var(--accent-teal)', marginBottom: '0.75rem', fontWeight: '600' }}>
                  🏪 Buying from: {cartVendorName}
                </p>
              )}

              {cart.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem' }}>
                  No items added. Click "Buy from Seller" on any listing.
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
                          >×</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="cart-total">
                    <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Order Total</span>
                    <span className="data-num currency-inr" style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {cartTotal.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handleSubmitOrder}
                    className="btn btn-indigo"
                    style={{ width: '100%', marginTop: '1rem' }}
                  >
                    Place Order
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* My Purchase Orders */}
        <div className="glass-panel" style={{ marginTop: '2rem' }}>
          <h2>My Purchase Orders</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Track your purchase orders from sellers.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
            {orders.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                You have not placed any orders yet.
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="glass-panel" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '700' }}>Order #{order.id}</span>
                    <span className={`badge badge-${order.status}`}>{order.status}</span>
                  </div>

                  {order.vendorName && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent-teal)', fontWeight: '600', marginBottom: '0.25rem' }}>
                      Seller: {order.vendorName}
                    </div>
                  )}

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Placed: {new Date(order.createdAt).toLocaleString()}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {order.items.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>{item.productName} ({item.orderedQuantity} {item.orderedUnit})</span>
                        <span className="data-num currency-inr" style={{ color: 'var(--text-secondary)' }}>
                          {item.itemTotalPrice.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total</span>
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
