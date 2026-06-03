import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { OrderService } from '@/services/orderService';
import { Order } from '@/models/Order';

export class OrderController {
  /**
   * Translates orders fetch GET requests.
   */
  static async getOrders(request) {
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

  /**
   * Translates quotation request placement POST requests.
   * Supports both 'procurement' (seller←admin) and 'sale' (customer←seller).
   */
  static async placeOrder(request) {
    const sessionCookie = request.cookies.get('session');
    const sessionToken = sessionCookie?.value;
    const user = await verifySession(sessionToken);

    if (!user || !['seller', 'user'].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized: Sellers or Customers only" }, { status: 403 });
    }

    try {
      const orderData = await request.json();

      // Entity level validation
      try {
        Order.validate(orderData);
      } catch (validationErr) {
        return NextResponse.json({ error: validationErr.message }, { status: 400 });
      }

      const orderType = orderData.orderType || 'procurement';
      const vendorId  = orderData.vendorId  || null;

      // Only customers can place sale orders; only sellers can place procurement orders
      if (orderType === 'sale' && user.role !== 'user') {
        return NextResponse.json({ error: 'Only customers can place sale orders' }, { status: 403 });
      }
      if (orderType === 'procurement' && user.role !== 'seller') {
        return NextResponse.json({ error: 'Only sellers can place procurement orders' }, { status: 403 });
      }

      const result = await OrderService.placeOrder(
        user.userId, user.username, orderData.items, orderType, vendorId
      );

      return NextResponse.json({
        success:    true,
        orderId:    result.orderId,
        totalPrice: result.totalPrice
      }, { status: 201 });
    } catch (error) {
      console.error("POST order placement error:", error);
      return NextResponse.json({ error: error.message || "Failed to place order" }, { status: 400 });
    }
  }

  /**
   * Translates order status update PUT requests.
   */
  static async updateOrderStatus(request, id) {
    const sessionCookie = request.cookies.get('session');
    const sessionToken = sessionCookie?.value;
    const user = await verifySession(sessionToken);

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
    }

    try {
      const { status } = await request.json();
      if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }

      // Delegate to service
      const order = await OrderService.updateOrderStatus(id, status);
      return NextResponse.json({ success: true, order }, { status: 200 });
    } catch (error) {
      console.error("PUT order status error:", error);
      return NextResponse.json({ error: error.message || "Failed to update order status" }, { status: 500 });
    }
  }
}
