# AasaMedChem | Inventory & Order Management System

A high-precision chemical inventory and quotation/order management workspace built with Next.js, Neon PostgreSQL, and Vanilla CSS. The application features multi-dimension unit conversions, real-time calculation audits, and role-based access control (RBAC).

---

## 🌟 Project Features

1. **Custom Cookie-Based RBAC**: Direct middleware authentication redirection for **Admin** and **Seller/User** roles.
2. **Multi-Unit Chemical Conversions**: Supports seamless calculations across multiple units in the same dimension:
   - **Weight**: grams (`g`) $\leftrightarrow$ kilograms (`kg`)
   - **Volume**: milliliters (`mL`) $\leftrightarrow$ liters (`L`)
   - **Count**: items (`items`)
3. **High-Precision Data Types**: Numeric values (price, inventory, conversions) use PostgreSQL `NUMERIC(20, 8)` for zero-loss float calculations.
4. **Interactive Quotation Calculator**: Sellers can type in any compatible unit, and the workspace displays a live price conversion audit step-by-step.
5. **Admin Audit Viewer**: Admins see a detailed "Conversion & Calculation Audit" log for every order item to verify that conversion logic and pricing are correct.
6. **Automatic Stock Control**: Inventory levels drop automatically upon order placement and restore when an admin rejects a quotation.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 19 (Client Components), Next.js 16 (App Router), Vanilla CSS (Clean Light-Themed Enterprise UI).
- **Backend**: Next.js App Router API Routes.
- **Database**: Neon Serverless PostgreSQL.
- **Authentication**: Custom signed sessions via standard **Web Crypto API** (HMAC-SHA256), compatible with Next.js Edge Middleware.

### Strict N-Tier (MVC) Architecture
The project is built on a clean, scalable N-Tier Architecture with clear separation of concerns:
1. **Presentation / Routing Layer**: Next.js client pages (JSX) and route endpoints (`src/app/api/...`) that only handle network routing and delegate to Controllers.
2. **Controller Layer**: Handles HTTP input mapping, request payload validation, and packages outcomes into NextResponse JSON models (`src/controllers/...`).
3. **Service Layer**: Implements core business logic, conversions, calculations, validations, and manages operations across repositories (`src/services/...`).
4. **Repository Layer (DAL)**: The **ONLY** location containing database SQL client queries (`src/repositories/...`).
5. **Model Layer**: Defines validation constraints and domain models (`src/models/...`).
6. **Middleware Layer**: Modular Edge RBAC middleware controls (`src/middlewares/...`).

```mermaid
graph TD
    UI[Client Presentation Layer] <-->|JSON API| Router[App Router Endpoints]
    Router <--> Controller[Controller Layer]
    Controller <--> Service[Service Layer]
    Service <--> Repository[Repository Layer]
    Repository <--> Neon[Neon PostgreSQL Client]
    Router -.->|Session Token| Middleware[Edge RBAC Middleware]
```

---

## 🗄️ Database Schema & Data Types

To ensure high decimal precision for micro-weights (milligrams/grams) or high-volume counts without floating-point errors, all measurements, prices, and quantities are stored as `NUMERIC(20, 8)`.

### 1. `users` Table
Stores users and their roles (`admin` or `seller`).
- `id`: `SERIAL PRIMARY KEY`
- `username`: `VARCHAR(50) UNIQUE`
- `password_hash`: `VARCHAR(255)`
- `role`: `VARCHAR(20)` (`admin` or `seller`)
- `name`: `VARCHAR(100)`

### 2. `products` Table
Holds chemicals, lab hardware, and inventory settings.
- `id`: `SERIAL PRIMARY KEY`
- `name`: `VARCHAR(100)`
- `sku`: `VARCHAR(50) UNIQUE`
- `description`: `TEXT`
- `category`: `VARCHAR(50)`
- `dimension`: `VARCHAR(20)` (`weight`, `volume`, `count`)
- `base_unit`: `VARCHAR(10)` (`g`, `kg`, `mL`, `L`, `items`)
- `base_price`: `NUMERIC(20, 8)` (Price per base_unit in INR)
- `inventory`: `NUMERIC(20, 8)` (Available stock in terms of base_unit)

### 3. `orders` Table
Stores parent quotation logs.
- `id`: `SERIAL PRIMARY KEY`
- `seller_id`: `INTEGER` (References `users(id)`)
- `seller_name`: `VARCHAR(100)`
- `status`: `VARCHAR(20)` (`pending`, `approved`, `rejected`)
- `total_price`: `NUMERIC(20, 8)` (Total quotation amount in INR)
- `created_at`: `TIMESTAMP`

### 4. `order_items` Table
Stores items in a quotation, preserving details at order-time alongside audit steps.
- `id`: `SERIAL PRIMARY KEY`
- `order_id`: `INTEGER` (References `orders(id)`)
- `product_id`: `INTEGER` (References `products(id)`)
- `product_name`: `VARCHAR(100)`
- `ordered_quantity`: `NUMERIC(20, 8)` (Quantity inputted by Seller)
- `ordered_unit`: `VARCHAR(10)` (Unit selected by Seller)
- `converted_quantity`: `NUMERIC(20, 8)` (Quantity converted to product base_unit)
- `base_unit`: `VARCHAR(10)` (Product base unit)
- `price_per_base_unit`: `NUMERIC(20, 8)` (Base price per base unit at checkout)
- `item_total_price`: `NUMERIC(20, 8)` (Preserved total cost: $\text{converted\_quantity} \times \text{price\_per\_base\_unit}$)

---

## 📈 Unit Conversion Strategy

### 1. The Conversion Matrix
Units within the same dimension are mapped in `src/lib/conversions.js`:
```javascript
const CONVERSIONS = {
  weight: {
    g: { g: 1, kg: 0.001 },
    kg: { g: 1000, kg: 1 }
  },
  volume: {
    mL: { mL: 1, L: 0.001 },
    L: { mL: 1000, L: 1 }
  },
  count: {
    items: { items: 1 }
  }
};
```

### 2. Conversions in Action
- **Interactive Calculator (Frontend)**: As a seller inputs a quantity and selects a unit, the UI looks up the dimension conversion factor, showing a live preview of the converted quantity and computed price in INR.
- **Stock Check & Reduction (Backend)**: When the quotation is submitted, the backend converts the ordered quantity to the product's configured base unit and checks if that amount is available in stock.
- **Audit Logging (Database)**: The order items table stores both the seller's original input (`ordered_quantity`, `ordered_unit`) and the converted amount (`converted_quantity`, `base_unit`) so that calculations are 100% auditable.

---

## 🚀 Setup & Installation Instructions

### 1. Clone the workspace and verify dependencies
Ensure you are in the workspace root. Run:
```bash
npm install
```

### 2. Set Up Environment Variables
Create a `.env.local` file in the project root:
```env
# Neon Connection String
DATABASE_URL="postgresql://username:password@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Secret Key for JWT session signing (can be anything)
JWT_SECRET="your-secret-key-here"
```

### 3. Initialize & Seed Neon Database
We have provided a database initialization script. Run:
```bash
npm run db:setup
```
This script will construct the tables, establish foreign key constraints, and seed initial demo accounts and chemicals.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔐 Demo Accounts / Test Credentials

- **Admin Account**:
  - **Username**: `admin`
  - **Password**: `adminpassword`
- **Seller Account**:
  - **Username**: `seller`
  - **Password**: `sellerpassword`
- **Customer Account**:
  - **Username**: `customer`
  - **Password**: `customerpassword`

---

## ☁️ Deployment on Vercel

1. Push this repository to GitHub.
2. Link your GitHub repository in your Vercel Dashboard.
3. Configure the environment variables in Vercel:
   - `DATABASE_URL`: Add your Neon connection string.
   - `JWT_SECRET`: Add a secure signing key.
4. Click **Deploy**. Vercel will build the application.
