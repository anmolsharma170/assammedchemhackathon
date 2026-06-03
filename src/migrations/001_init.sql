-- 1. Drop existing tables if they exist
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'seller', 'user')),
  name VARCHAR(100) NOT NULL
);

-- 3. Create products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sku VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50),
  dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('weight', 'volume', 'count')),
  base_unit VARCHAR(10) NOT NULL CHECK (base_unit IN ('g', 'kg', 'mL', 'L', 'items')),
  base_price NUMERIC(20, 8) NOT NULL,
  inventory NUMERIC(20, 8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create orders table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  total_price NUMERIC(20, 8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create order_items table
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name VARCHAR(100) NOT NULL,
  ordered_quantity NUMERIC(20, 8) NOT NULL,
  ordered_unit VARCHAR(10) NOT NULL,
  converted_quantity NUMERIC(20, 8) NOT NULL,
  base_unit VARCHAR(10) NOT NULL,
  price_per_base_unit NUMERIC(20, 8) NOT NULL,
  item_total_price NUMERIC(20, 8) NOT NULL
);

-- 6. Seed Users
-- Passwords: adminpassword, sellerpassword, customerpassword
-- We seed the pre-computed bcrypt hashes of the passwords for fast startup.
INSERT INTO users (username, password_hash, role, name) VALUES
('admin', '$2b$10$ca0tBMMwkrb2kpmIRpqtT.QsM3sJL9n.enrTGK5LkHKkOoYZhpOdW', 'admin', 'System Administrator'),
('seller', '$2b$10$gDHNAmGsqh5QQvsvWEPHVOiqHct3e28GRygkVj7b0sv9z0ZPpSRf2', 'seller', 'Lead Lab Seller'),
('customer', '$2b$10$YZbGB/YmzhEZlGzfJEgP7.S0TfPF.MxcFx1uuGm.Pv6GxhjlY43Ce', 'user', 'Standard Lab Customer');

-- 7. Seed Products
INSERT INTO products (name, sku, description, category, dimension, base_unit, base_price, inventory) VALUES
('Sodium Chloride', 'CHEM-NACL-001', 'High-purity sodium chloride (reagent grade) for chemical synthesis.', 'Reagents', 'weight', 'g', 2.50, 50000),
('Ethanol 99%', 'CHEM-ETH-500', '99% pure laboratory grade ethanol.', 'Solvents', 'volume', 'mL', 1.20, 100000),
('Hydrochloric Acid 37%', 'CHEM-HCL-001', 'Reagent grade HCl (37% aqueous solution). Handle with care.', 'Acids', 'volume', 'L', 850.00, 50),
('Sodium Hydroxide Pellets', 'CHEM-NAOH-002', 'High-grade NaOH pellets for synthesis.', 'Bases', 'weight', 'kg', 450.00, 25),
('Nitrile Gloves (Medium)', 'EQP-GLV-MED', 'Powder-free, chemical resistant nitrile gloves, box of 100.', 'Equipment', 'count', 'items', 12.00, 1200),
('Glass Test Tubes (15mL)', 'EQP-TT-15ML', 'Borosilicate glass test tubes, round bottom, pack of 50.', 'Glassware', 'count', 'items', 45.00, 500);
