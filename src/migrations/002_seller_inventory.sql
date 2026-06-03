-- Migration 002: Seller Inventory + Order Type
-- Adds seller_inventory table and order_type/vendor_id columns to orders

-- 1. Create seller_inventory table
-- Each row tracks how much of a given product a seller currently holds in stock.
-- quantity is always stored in base units (same as products.inventory).
-- selling_price is the price the seller charges customers (per base unit, INR).
CREATE TABLE IF NOT EXISTS seller_inventory (
  id            SERIAL PRIMARY KEY,
  seller_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity      NUMERIC(20, 8) NOT NULL DEFAULT 0,
  selling_price NUMERIC(20, 8) NOT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(seller_id, product_id)
);

-- 2. Add order_type column to orders
-- 'procurement' = seller buying from admin inventory
-- 'sale'        = customer buying from a seller's inventory
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'procurement';

-- 3. Add vendor_id column to orders
-- NULL for procurement (fulfilled by admin)
-- seller user ID for sale orders (fulfilled by that seller)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES users(id);
