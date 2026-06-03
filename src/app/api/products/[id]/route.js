import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { ProductService } from '@/services/productService';

// PUT: Admin updates a product
export async function PUT(request, { params }) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
  }

  const { id } = await params;

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

    // Validate numbers
    const numericPrice = parseFloat(base_price);
    const numericInventory = parseFloat(inventory);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return NextResponse.json({ error: "Base price must be a valid positive number" }, { status: 400 });
    }
    if (isNaN(numericInventory) || numericInventory < 0) {
      return NextResponse.json({ error: "Inventory must be a valid non-negative number" }, { status: 400 });
    }

    // Check SKU uniqueness excluding current product
    const exists = await ProductService.checkSkuExists(sku, id);
    if (exists) {
      return NextResponse.json({ error: "Product with this SKU already exists" }, { status: 400 });
    }

    // Update product via service
    const product = await ProductService.updateProduct(id, {
      name,
      sku,
      description,
      category,
      dimension,
      base_unit,
      base_price: numericPrice,
      inventory: numericInventory
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, product }, { status: 200 });
  } catch (error) {
    console.error("PUT product error:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

// DELETE: Admin deletes a product
export async function DELETE(request, { params }) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const deleted = await ProductService.deleteProduct(id);
    if (!deleted) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Product deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("DELETE product error:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
