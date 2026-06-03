'use client';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FILE: src/app/seller/page.js
 * LAYER: UI  (Client-side React component)
 *
 * UNIT CONVERSION — CLIENT-SIDE (LIVE PREVIEW)
 * ─────────────────────────────────────────────────────────────────────────────
 * This page imports the SAME convertQuantity() + CONVERSIONS table that the
 * server uses (src/lib/conversions.js).  This means:
 *   • The live price preview shown to the seller is always identical to what
 *     the server will compute when the order is actually submitted.
 *   • No round-trip to the API is needed just to preview a price.
 *
 * HOW CONVERSION FLOWS IN THE UI
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Seller clicks "Add to Quote" on a product.
 *    → selectProductForCalc() sets selectedProduct and defaults unit to base_unit.
 *
 * 2. Seller types a quantity or changes the unit dropdown.
 *    → handleCalcQtyChange / handleCalcUnitChange both call runLiveConversion().
 *    → runLiveConversion() calls convertQuantity(qty, chosenUnit, base_unit, dimension)
 *       and immediately updates the "Live Conversion Preview" panel.
 *
 * 3. Seller clicks "Add to Cart".
 *    → handleAddToCart() re-runs the conversion (in case state is stale),
 *      checks local inventory, then stores BOTH the original (ordered) values
 *      AND the converted (base-unit) values in the cart item.
 *
 * 4. Seller clicks "Submit Quotation".
 *    → Only the original ordered qty + unit are sent to the API.
 *    → The server re-converts and re-validates everything independently.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// CONVERSIONS is also used here to build the unit dropdown from the product's dimension.
import { convertQuantity, CONVERSIONS } from '@/lib/conversions';

export default function SellerDashboard() {
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
  
  // Seller Orders History State
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

  /**
   * selectProductForCalc
   * Called when a seller clicks "Add to Quote" on a catalog row.
   * Initialises the calculator with:
   *   – qty  = 1  (sensible default)
   *   – unit = product.base_unit  (no conversion needed at start)
   * Then immediately runs the conversion so the price preview is visible
   * before the seller even types anything.
   */
  const selectProductForCalc = (product) => {
    setSelectedProduct(product);
    setCalcQty('1');
    setCalcUnit(product.base_unit); // Start in the base unit (no conversion needed)
    runLiveConversion('1', product.base_unit, product);
  };

  // ── Triggered every time the quantity input changes ────────────────────────
  const handleCalcQtyChange = (e) => {
    const value = e.target.value;
    setCalcQty(value);
    runLiveConversion(value, calcUnit, selectedProduct); // recalculate on every keystroke
  };

  // ── Triggered every time the unit dropdown changes ────────────────────────
  const handleCalcUnitChange = (e) => {
    const unit = e.target.value;
    setCalcUnit(unit);
    runLiveConversion(calcQty, unit, selectedProduct); // recalculate for new unit
  };

  /**
   * runLiveConversion  ← CORE CLIENT-SIDE CONVERSION FUNCTION
   * ───────────────────────────────────────────────────────────────────────────
   * Computes and displays the real-time price estimate as the seller types.
   *
   * How it works:
   *   1. Parse the quantity string to a float.  Reject invalid/negative values.
   *   2. Call convertQuantity(qty, chosenUnit, base_unit, dimension)
   *      from src/lib/conversions.js – the same function the server uses.
   *      Example: 2 kg → 2000 g  (factor = 1000)
   *   3. Multiply converted quantity by base_price (₹ per base unit).
   *      Example: 2000 g × ₹0.05/g = ₹100
   *   4. Update React state → triggers re-render of "Live Conversion Preview".
   *
   * Edge cases:
   *   • qty = 0 or NaN  → reset display to 0 (no throw)
   *   • Invalid unit combo → convertQuantity throws; we catch and reset to 0
   *     so the UI never shows a broken price.
   */
  const runLiveConversion = (qtyStr, unit, product) => {
    if (!product) return;

    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      // Invalid input – clear the preview rather than show NaN
      setCalcConvertedQty(0);
      setCalcTotalPrice(0);
      return;
    }

    try {
      // ── UNIT CONVERSION (client-side, same logic as server) ──────────────
      // convertQuantity uses CONVERSIONS[dimension][unit][product.base_unit]
      // Example: unit='kg', base_unit='g'  → factor=1000  → 2kg → 2000g
      const converted = convertQuantity(qty, unit, product.base_unit, product.dimension);

      // ── PRICE CALCULATION ────────────────────────────────────────────────
      // base_price is always ₹ per base unit (e.g. ₹0.05 per gram)
      // Total price = converted quantity (in base unit) × base_price
      const total = converted * parseFloat(product.base_price);

      setCalcConvertedQty(converted); // shown in the Live Conversion Preview
      setCalcTotalPrice(total);        // shown as Estimated Quote (₹)
    } catch (err) {
      // Conversion not possible for this unit combo – silently reset display
      console.error(err);
      setCalcConvertedQty(0);
      setCalcTotalPrice(0);
    }
  };

  /**
   * handleAddToCart
   * ───────────────────────────────────────────────────────────────────────────
   * Validates the current calculator state and adds the item to the local
   * quotation cart.  The cart stores BOTH:
   *   • orderedQuantity + orderedUnit  → what the seller sees / typed
   *   • convertedQuantity + baseUnit   → base-unit equivalent for price/stock
   *
   * LOCAL INVENTORY CHECK (pre-flight before API call)
   * ───────────────────────────────────────────────────────────────────────────
   * We compare against product.inventory (base units from DB) to give instant
   * feedback without a server round-trip.  The server will re-validate anyway.
   *
   * The check is cumulative: if the same product is already in the cart, we
   * add the existing converted quantity to the new one before comparing.
   */
  const handleAddToCart = (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const qty = parseFloat(calcQty);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a valid positive quantity');
      return;
    }

    // ── LOCAL INVENTORY CHECK ────────────────────────────────────────────────
    // All comparisons happen in base units so they match the DB column.
    const existingInCart = cart.find((item) => item.productId === selectedProduct.id);
    const existingConvertedQty = existingInCart ? existingInCart.convertedQuantity : 0;
    // calcConvertedQty was set by runLiveConversion(); it is already in base units.
    const totalRequestedConverted = calcConvertedQty + existingConvertedQty;

    if (totalRequestedConverted > parseFloat(selectedProduct.inventory)) {
      setError(
        `Cannot add to cart: Total requested quantity exceeds available stock ` +
        `(${selectedProduct.inventory} ${selectedProduct.base_unit})`
      );
      return;
    }

    if (existingInCart) {
      // ── UPDATE EXISTING CART ITEM ──────────────────────────────────────────
      // Merge the quantities: add new qty to existing orderedQuantity, then
      // re-run conversion on the cumulative total (more accurate than summing
      // convertedQuantities separately due to float precision).
      setCart(
        cart.map((item) => {
          if (item.productId === selectedProduct.id) {
            const newQty = item.orderedQuantity + qty;
            // Re-convert the merged quantity in one shot to avoid float drift
            const newConverted = convertQuantity(
              newQty,
              item.orderedUnit,
              selectedProduct.base_unit,
              selectedProduct.dimension
            );
            return {
              ...item,
              orderedQuantity: newQty,
              convertedQuantity: newConverted,            // base-unit total
              itemTotalPrice: newConverted * parseFloat(selectedProduct.base_price),
            };
          }
          return item;
        })
      );
    } else {
      // ── ADD NEW CART ITEM ──────────────────────────────────────────────────
      // Store both the user-facing representation and the base-unit values.
      // The server only needs orderedQuantity + orderedUnit (it re-converts).
      // convertedQuantity is kept locally for the cumulative stock check above.
      setCart([
        ...cart,
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          orderedQuantity: qty,           // as typed by seller (display)
          orderedUnit: calcUnit,           // unit seller chose (display)
          convertedQuantity: calcConvertedQty, // base-unit qty (local stock guard)
          baseUnit: selectedProduct.base_unit,
          dimension: selectedProduct.dimension,
          pricePerBaseUnit: parseFloat(selectedProduct.base_price),
          itemTotalPrice: calcTotalPrice,  // ₹ total already computed by runLiveConversion
        },
      ]);
    }

    setSuccess(`Added ${qty} ${calcUnit} of ${selectedProduct.name} to cart.`);
    setSelectedProduct(null); // Close the calculator panel
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

      setSuccess('Quotation submitted successfully!');
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
        <h2 style={{ color: 'var(--accent-teal)' }}>Loading Seller Workspace...</h2>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🧪</div>
          AasaMedChem <span style={{ fontSize: '0.9rem', color: 'var(--accent-indigo)', marginLeft: '0.25rem' }}>Seller Desk</span>
        </div>
        <div className="user-badge">
          {currentUser && (
            <>
              <span className="role-pill seller">Seller</span>
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
        {/* Seller Workspace Guide */}
        <div style={{ padding: '1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '1.5rem', color: '#1e3a8a', fontSize: '0.9rem', lineHeight: '1.5' }}>
          💡 <strong>Seller Workspace</strong>: Select a chemical from the catalog below and click <strong>Add to Quote</strong>. 
          Use the calculator sidebar to input your quantity in any compatible unit (e.g. grams vs kilograms) to preview the live price conversion and add it to your quotation cart.
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
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Browse chemicals, enter customized quantities, and compute real-time quotes.</p>
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
                          <td className="data-num nowrap" style={{ color: 'var(--accent-indigo)' }}>{p.sku}</td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{p.name}</div>
                            {p.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.description}</div>}
                          </td>
                          <td className="nowrap">{p.category}</td>
                          <td className="data-num currency-inr nowrap">
                            {parseFloat(p.base_price).toFixed(2)} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/{p.base_unit}</span>
                          </td>
                          <td className="data-num nowrap" style={{ color: isOutOfStock ? 'var(--color-danger)' : 'var(--text-primary)' }}>
                            {isOutOfStock ? 'Out of Stock' : `${parseFloat(p.inventory).toFixed(2)} ${p.base_unit}`}
                          </td>
                          <td className="nowrap" style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => selectProductForCalc(p)}
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                              disabled={isOutOfStock}
                            >
                              Add to Quote
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
              <div className="glass-panel glow-accent" style={{ borderLeft: '4px solid var(--accent-teal)' }}>
                <h3>Quotation Calculator</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Product: <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct.name}</strong> ({selectedProduct.sku})<br />
                  Internal Base Unit: <code>{selectedProduct.base_unit}</code> | Price: <span className="currency-inr">{parseFloat(selectedProduct.base_price).toFixed(2)}</span>
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
                    <p>Dimension: <strong style={{ textTransform: 'capitalize' }}>{selectedProduct.dimension}</strong></p>
                    
                    {calcUnit !== selectedProduct.base_unit ? (
                      <p>
                        Unit Conversion: <code>{calcQty || '0'} {calcUnit}</code> matches <code>{calcConvertedQty.toFixed(4)} {selectedProduct.base_unit}</code> in storage.
                      </p>
                    ) : (
                      <p>No conversion required (matches base storage unit).</p>
                    )}
                    
                    <p style={{ marginTop: '0.2rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                      Estimated Quote: <code>{calcConvertedQty.toFixed(4)} × ₹{parseFloat(selectedProduct.base_price).toFixed(2)} = </code>
                      <span className="currency-inr" style={{ color: 'var(--accent-teal)', fontSize: '0.95rem', fontWeight: '700' }}>{calcTotalPrice.toFixed(2)}</span>
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
                  No items added. Click "Add to Quote" on any product above.
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
                    <span className="data-num currency-inr" style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {cartTotal.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handleSubmitQuotation}
                    className="btn btn-indigo"
                    style={{ width: '100%', marginTop: '1rem' }}
                  >
                    Submit Quotation
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Order History Section */}
        <div className="glass-panel" style={{ marginTop: '2rem' }}>
          <h2>My Submitted Quotations</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Track the status of your quotations and orders.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
            {orders.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                You have not placed any quotations yet.
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="glass-panel" style={{ padding: '1.25rem', borderLeft: '3px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '700' }}>Order #{order.id}</span>
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

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
