import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { ProductService } from '@/services/productService';

// GET: List all products with search & filter
export async function GET(request) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query') || '';
  const category = searchParams.get('category') || '';
  
  try {
    const products = await ProductService.getProducts(query, category);
    return NextResponse.json({ products }, { status: 200 });
  } catch (error) {
    console.error("GET products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// POST: Admin creates a new product
export async function POST(request) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
  }

  try {
    const { name, sku, description, category, dimension, base_unit, base_price, inventory } = await request.json();

    if (!name || !sku || !dimension || !base_unit || base_price === undefined || inventory === undefined) {
      return NextResponse.json({ error: "Required fields are missing" }, { status: 400 });
    }

    // Validate dimension and unit combinations
    const validUnits = {
      weight: ['g', 'kg'],
      volume: ['mL', 'L'],
      count: ['items']
    };

    if (!validUnits[dimension] || !validUnits[dimension].includes(base_unit)) {
      return NextResponse.json({ 
        error: `Invalid unit '${base_unit}' for dimension '${dimension}'. Valid options: ${validUnits[dimension].join(', ')}` 
      }, { status: 400 });
    }

    // Validate numeric values
    const numericPrice = parseFloat(base_price);
    const numericInventory = parseFloat(inventory);

    if (isNaN(numericPrice) || numericPrice < 0) {
      return NextResponse.json({ error: "Base price must be a valid positive number" }, { status: 400 });
    }
    if (isNaN(numericInventory) || numericInventory < 0) {
      return NextResponse.json({ error: "Inventory must be a valid non-negative number" }, { status: 400 });
    }

    // Check SKU uniqueness via service
    const exists = await ProductService.checkSkuExists(sku);
    if (exists) {
      return NextResponse.json({ error: "Product with this SKU already exists" }, { status: 400 });
    }

    // Insert product via service
    const product = await ProductService.createProduct({
      name,
      sku,
      description,
      category,
      dimension,
      base_unit,
      base_price: numericPrice,
      inventory: numericInventory
    });

    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (error) {
    console.error("POST product error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
