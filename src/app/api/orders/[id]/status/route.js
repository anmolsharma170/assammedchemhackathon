import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifySession } from '@/lib/auth-crypto';

// PUT: Update order status (Admin only)
export async function PUT(request, { params }) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
  }

  const { id } = await params;
  
  try {
    const { status } = await request.json();
    if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Get current order details
    const orders = await sql`SELECT * FROM orders WHERE id = ${id}`;
    if (orders.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orders[0];
    const oldStatus = order.status;

    if (oldStatus === status) {
      return NextResponse.json({ success: true, message: `Status is already '${status}'` }, { status: 200 });
    }

    // Get order items
    const items = await sql`SELECT * FROM order_items WHERE order_id = ${id}`;

    // Handle inventory adjustments based on state transitions
    if (oldStatus !== 'rejected' && status === 'rejected') {
      // Revert stock deductions (restore inventory)
      for (const item of items) {
        await sql`
          UPDATE products 
          SET inventory = inventory + ${item.converted_quantity}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${item.product_id}
        `;
      }
    } else if (oldStatus === 'rejected' && status !== 'rejected') {
      // Re-deduct inventory. Check stock levels first.
      for (const item of items) {
        const products = await sql`SELECT inventory, name FROM products WHERE id = ${item.product_id}`;
        if (products.length === 0) {
          return NextResponse.json({ error: `Product ${item.product_name} no longer exists` }, { status: 400 });
        }
        const currentStock = parseFloat(products[0].inventory);
        if (currentStock < parseFloat(item.converted_quantity)) {
          return NextResponse.json({ 
            error: `Cannot reactivate order: Insufficient stock for product ${products[0].name}. Required: ${item.converted_quantity}, Available: ${currentStock}` 
          }, { status: 400 });
        }
      }
      
      // Perform deduction
      for (const item of items) {
        await sql`
          UPDATE products 
          SET inventory = inventory - ${item.converted_quantity}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${item.product_id}
        `;
      }
    }

    // Update status
    const result = await sql`
      UPDATE orders SET status = ${status} WHERE id = ${id} RETURNING *
    `;

    return NextResponse.json({ success: true, order: result[0] }, { status: 200 });
  } catch (error) {
    console.error("PUT order status error:", error);
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }
}
