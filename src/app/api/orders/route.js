import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { OrderService } from '@/services/orderService';

// GET: Fetch orders (Admin sees all; Seller/Customer sees their own)
export async function GET(request) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await OrderService.getOrders(user.userId, user.role);
    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    console.error("GET orders error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

// POST: Place a new order/quotation (Sellers or Customers)
export async function POST(request) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  const user = await verifySession(sessionToken);

  if (!user || !['seller', 'user'].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized: Sellers or Customers only" }, { status: 403 });
  }

  try {
    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order must contain at least one item" }, { status: 400 });
    }

    // Delegate creation to service
    const result = await OrderService.placeOrder(user.userId, user.username, items);

    return NextResponse.json({ 
      success: true, 
      orderId: result.orderId, 
      totalPrice: result.totalPrice 
    }, { status: 201 });
  } catch (error) {
    console.error("POST order placement error:", error);
    return NextResponse.json({ error: error.message || "Failed to place order" }, { status: 400 });
  }
}
