import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { OrderService } from '@/services/orderService';

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

    // Delegate status transition and inventory logic to OrderService
    const order = await OrderService.updateOrderStatus(id, status);

    return NextResponse.json({ success: true, order }, { status: 200 });
  } catch (error) {
    console.error("PUT order status error:", error);
    return NextResponse.json({ error: error.message || "Failed to update order status" }, { status: 500 });
  }
}
