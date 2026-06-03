import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { ProductService } from '@/services/productService';
import { Product } from '@/models/Product';

export class ProductController {
  /**
   * Translates catalog fetch GET requests.
   */
  static async getProducts(request) {
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

  /**
   * Translates product addition POST requests.
   */
  static async createProduct(request) {
    const sessionCookie = request.cookies.get('session');
    const sessionToken = sessionCookie?.value;
    const user = await verifySession(sessionToken);

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
    }

    try {
      const productData = await request.json();

      // Entity level validation
      try {
        Product.validate(productData);
      } catch (validationErr) {
        return NextResponse.json({ error: validationErr.message }, { status: 400 });
      }

      // Check SKU uniqueness
      const exists = await ProductService.checkSkuExists(productData.sku);
      if (exists) {
        return NextResponse.json({ error: "Product with this SKU already exists" }, { status: 400 });
      }

      // Delegate creation to service
      const product = await ProductService.createProduct(productData);
      return NextResponse.json({ success: true, product }, { status: 201 });
    } catch (error) {
      console.error("POST product error:", error);
      return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }
  }

  /**
   * Translates product edit PUT requests.
   */
  static async updateProduct(request, id) {
    const sessionCookie = request.cookies.get('session');
    const sessionToken = sessionCookie?.value;
    const user = await verifySession(sessionToken);

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
    }

    try {
      const productData = await request.json();

      // Entity level validation
      try {
        Product.validate(productData);
      } catch (validationErr) {
        return NextResponse.json({ error: validationErr.message }, { status: 400 });
      }

      // Check SKU uniqueness excluding current product
      const exists = await ProductService.checkSkuExists(productData.sku, id);
      if (exists) {
        return NextResponse.json({ error: "Product with this SKU already exists" }, { status: 400 });
      }

      // Delegate update to service
      const product = await ProductService.updateProduct(id, productData);
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, product }, { status: 200 });
    } catch (error) {
      console.error("PUT product error:", error);
      return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
    }
  }

  /**
   * Translates product deletion DELETE requests.
   */
  static async deleteProduct(request, id) {
    const sessionCookie = request.cookies.get('session');
    const sessionToken = sessionCookie?.value;
    const user = await verifySession(sessionToken);

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
    }

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
}
