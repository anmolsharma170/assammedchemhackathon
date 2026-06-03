# AasaMedChem — Inventory & Order Management System

A high-precision chemical inventory and quotation/order management platform built with **Next.js 16**, **Neon PostgreSQL**, and **Vanilla CSS**. The application features multi-dimension unit conversions, a live quotation calculator, role-based access control, and automatic inventory management.

---

## 🌟 Features

| Feature | Description |
|---|---|
| **Role-Based Access Control** | Admin and Seller roles enforced at the Edge via Next.js middleware |
| **Multi-Unit Conversions** | Seamless g ↔ kg, mL ↔ L, and items support with a shared conversion matrix |
| **Live Quotation Calculator** | Sellers preview converted quantity and INR price in real-time before ordering |
| **High-Precision Storage** | All quantities and prices stored as `NUMERIC(20, 8)` to handle micro-weights and large volumes without float errors |
| **Automatic Stock Control** | Inventory deducted on order placement; restored on admin rejection |
| **Conversion Audit Trail** | Both the seller's original input and the base-unit equivalent are stored per order line for full auditability |
| **Admin Dashboard** | Full CRUD for products, order status management, and per-order conversion audit viewer |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **UI** | React 19, Vanilla CSS (custom design system) |
| **Database** | Neon Serverless PostgreSQL (`@neondatabase/serverless`) |
| **Authentication** | Custom HMAC-SHA256 signed sessions via the Web Crypto API (Edge-compatible, no JWT library at runtime) |
| **Password Hashing** | `bcryptjs` |
| **Deployment** | Vercel (zero-config with Next.js) |

---

## 🏗️ Architecture — Strict N-Tier MVC

The codebase is organized into clearly separated layers. Each layer has a single responsibility and only communicates with its immediate neighbor.

```
src/
├── app/                    # Presentation Layer — Next.js pages & API route endpoints
│   ├── admin/              #   Admin dashboard (React client component)
│   ├── seller/             #   Seller workspace (React client component)
│   ├── user/               #   Customer view (React client component)
│   ├── login/              #   Authentication page
│   └── api/                #   API route handlers (thin — delegate to Controllers)
│       ├── auth/
│       ├── products/
│       └── orders/
├── controllers/            # Controller Layer — HTTP input mapping & response packaging
│   ├── AuthController.js
│   ├── ProductController.js
│   └── OrderController.js
├── services/               # Service Layer — Business logic, conversions, validation
│   ├── authService.js
│   ├── productService.js
│   └── orderService.js
├── repositories/           # Repository Layer (DAL) — All SQL queries live here
│   ├── UserRepository.js
│   ├── ProductRepository.js
│   └── OrderRepository.js
├── models/                 # Model Layer — Domain shape definitions & constraints
│   ├── User.js
│   ├── Product.js
│   └── Order.js
├── middlewares/            # Middleware Layer — Modular Edge RBAC helpers
│   └── rbacMiddleware.js
├── lib/                    # Shared Utilities
│   ├── db.js               #   Neon SQL client singleton
│   ├── auth-crypto.js      #   Web Crypto session sign/verify helpers
│   └── conversions.js      #   Unit conversion matrix & convertQuantity()
├── migrations/             # Database Migrations
│   ├── 001_init.sql        #   Schema DDL + seed data
│   └── migrate.js          #   Migration runner script
└── middleware.js           # Next.js Edge Middleware entry point (RBAC routing)
```

### Request Flow

```
Browser → Edge Middleware (RBAC check)
       → API Route (route.js) — thin handler
       → Controller — validates HTTP input, calls Service
       → Service — business logic, runs unit conversions
       → Repository — executes SQL against Neon PostgreSQL
       ← Response bubbles back up the same chain
```

---

## 🗄️ Database Schema & Data Type Decisions

### Why `NUMERIC(20, 8)`?

All quantity, price, and inventory columns use PostgreSQL `NUMERIC(20, 8)`:

- **Precision**: Up to 20 significant digits with 8 decimal places — handles micro-gram measurements (e.g. `0.00000500 g`) and large bulk orders (e.g. `99999999.00000000 kg`) without floating-point rounding errors.
- **No float drift**: Unlike `FLOAT` or `DOUBLE`, `NUMERIC` is exact and safe for financial calculations such as INR pricing.

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `username` | `VARCHAR(50) UNIQUE` | Login identifier |
| `password_hash` | `VARCHAR(255)` | bcrypt hash |
| `role` | `VARCHAR(20)` | `admin`, `seller`, or `customer` |
| `name` | `VARCHAR(100)` | Display name |

### `products`
| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `name` | `VARCHAR(100)` | Product display name |
| `sku` | `VARCHAR(50) UNIQUE` | Unique stock-keeping unit code |
| `description` | `TEXT` | Optional product description |
| `category` | `VARCHAR(50)` | e.g. Organic, Inorganic, Reagent |
| `dimension` | `VARCHAR(20)` | `weight`, `volume`, or `count` |
| `base_unit` | `VARCHAR(10)` | Canonical storage unit: `g`, `mL`, or `items` |
| `base_price` | `NUMERIC(20, 8)` | Price in INR **per base unit** |
| `inventory` | `NUMERIC(20, 8)` | Available stock **in base units** |

### `orders`
| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `seller_id` | `INTEGER` | FK → `users(id)` |
| `seller_name` | `VARCHAR(100)` | Snapshot at order time |
| `status` | `VARCHAR(20)` | `pending`, `approved`, `rejected` |
| `total_price` | `NUMERIC(20, 8)` | Total order value in INR |
| `created_at` | `TIMESTAMP` | |

### `order_items`
| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `order_id` | `INTEGER` | FK → `orders(id)` |
| `product_id` | `INTEGER` | FK → `products(id)` |
| `product_name` | `VARCHAR(100)` | Snapshot at order time |
| `ordered_quantity` | `NUMERIC(20, 8)` | What the seller typed |
| `ordered_unit` | `VARCHAR(10)` | Unit the seller selected |
| `converted_quantity` | `NUMERIC(20, 8)` | Equivalent in `base_unit` |
| `base_unit` | `VARCHAR(10)` | Product's canonical unit |
| `price_per_base_unit` | `NUMERIC(20, 8)` | Price snapshot at order time |
| `item_total_price` | `NUMERIC(20, 8)` | `converted_quantity × price_per_base_unit` |

---

## 📐 Unit Conversion System

### Core Principle

Every product has a **base unit** stored in the database. All inventory levels, prices, and stock deductions are always expressed in that base unit:

| Dimension | Base unit stored in DB |
|---|---|
| weight | `g` (grams) |
| volume | `mL` (millilitres) |
| count | `items` |

### The Conversion Matrix (`src/lib/conversions.js`)

```javascript
const CONVERSIONS = {
  weight: {
    g:  { g: 1,       kg: 0.001 },   // 1 g  = 0.001 kg
    kg: { g: 1000,    kg: 1     },   // 1 kg = 1000 g
  },
  volume: {
    mL: { mL: 1,      L: 0.001  },   // 1 mL = 0.001 L
    L:  { mL: 1000,   L: 1      },   // 1 L  = 1000 mL
  },
  count: {
    items: { items: 1 },             // no sub-unit
  },
};
```

`convertQuantity(qty, fromUnit, toUnit, dimension)` is the single function used by **both the client and the server**, ensuring the live preview always matches what the server computes.

### How Conversion Is Applied

**Step-by-step for a seller ordering 2 kg of a product whose base unit is `g`:**

```
Ordered:   2 kg
Factor:    CONVERSIONS.weight.kg.g = 1000
Converted: 2 × 1000 = 2000 g  (stored/compared against inventory)
Price:     2000 × base_price (₹/g)
```

### Where Conversion Happens

| Location | When | Purpose |
|---|---|---|
| `src/app/seller/page.js` → `runLiveConversion()` | On every keystroke / unit change | Live price preview in the UI (no API call) |
| `src/services/orderService.js` → `placeOrder()` | On order submission | Server-side re-validation, inventory check, price computation, stock deduction |
| `src/services/orderService.js` → `updateOrderStatus()` | On admin status change | Recover or re-deduct stock in base units when order is rejected/reactivated |

### Edge Cases Handled

- **Very small quantities** (e.g. `0.001 g`) — `NUMERIC(20, 8)` stores 8 decimal places exactly; no rounding at the DB level.
- **Very large quantities** (e.g. `50000000 kg`) — `NUMERIC(20, 8)` supports up to 20 significant digits.
- **Cross-dimension orders** (e.g. trying to order `kg` of a `volume` product) — `convertQuantity()` throws an explicit error; the controller returns HTTP 400.
- **Cumulative cart stock check** — the seller UI adds up converted quantities for the same product across multiple cart additions before comparing against inventory.

### Adding a New Unit (e.g. pounds)

Only `src/lib/conversions.js` needs to change — add entries to the relevant dimension block:

```javascript
weight: {
  g:  { g: 1,       kg: 0.001, lb: 0.00220462 },
  kg: { g: 1000,    kg: 1,     lb: 2.20462    },
  lb: { g: 453.592, kg: 0.453592, lb: 1       },
}
```

No other file needs updating. Every caller goes through `convertQuantity()`.

---

## 🚀 Local Setup

### 1. Clone & Install

```bash
git clone https://github.com/anmolsharma170/assammedchemhackathon.git
cd assammedchemhackathon
npm install
```

### 2. Configure Environment Variables

Create `.env.local` in the project root:

```env
# Neon PostgreSQL connection string
DATABASE_URL="postgresql://username:password@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Secret key for HMAC-SHA256 session signing (use a long random string in production)
JWT_SECRET="your-secret-key-here"
```

### 3. Initialize the Database

```bash
npm run db:setup
```

This runs `src/migrations/migrate.js` which executes `001_init.sql` — creating all tables and seeding demo accounts and sample chemical products.

### 4. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page.

---

## 🔐 Demo Accounts

| Role | Username | Password |
|---|---|---|
| **Admin** | `admin` | `adminpassword` |
| **Seller** | `seller` | `sellerpassword` |
| **Customer** | `customer` | `customerpassword` |

---

## ☁️ Deployment on Vercel

1. Push the repository to GitHub.
2. Import the repository in [vercel.com/new](https://vercel.com/new).
3. Add the following **Environment Variables** in the Vercel project settings:
   - `DATABASE_URL` — your Neon connection string
   - `JWT_SECRET` — a long, random secret key
4. Click **Deploy**. Vercel auto-detects Next.js and handles the build.

> **Note**: The `npm run db:setup` migration must be run once manually (locally or via Vercel's CLI) to initialize the Neon database before first use.

---

## 📝 Commit Strategy

Commits were made in small, purposeful units — each representing a single logical piece of work. The project was built bottom-up following the N-Tier dependency order: database and migration scripts first, then the authentication and session layer, then API routes, then the UI pages. As the architecture was refactored into the full N-Tier MVC structure, each layer (Models, Repositories, Services, Controllers, Middlewares) was introduced in its own dedicated commit. Bug fixes and UI polish were always committed separately from feature additions, ensuring the git history reads as a clear narrative of the project's construction and every commit remains independently revertible.
