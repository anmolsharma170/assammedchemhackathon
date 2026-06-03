import { sql } from '@/lib/db';

export class OrderRepository {
  /**
   * Fetches an order record by ID.
   */
  static async findById(id) {
    const orders = await sql`SELECT * FROM orders WHERE id = ${id}`;
    return orders.length > 0 ? orders[0] : null;
  }

  /**
   * Fetches all items belonging to an order.
   */
  static async findItemsByOrderId(orderId) {
    return await sql`SELECT * FROM order_items WHERE order_id = ${orderId}`;
  }

  /**
   * Fetches orders with joined items.
   * - Admin sees all orders (both 'procurement' and 'sale')
   * - Seller/Customer sees only their own orders (where seller_id = userId)
   * Each row includes order_type and vendor details for display.
   */
  static async findAllWithItems(userId = null, role = 'admin') {
    if (role === 'admin') {
      return await sql`
        SELECT
          o.id           AS order_id,
          o.seller_id,
          o.seller_name,
          o.status,
          o.total_price,
          o.created_at,
          o.order_type,
          o.vendor_id,
          v.name         AS vendor_name,
          oi.id          AS item_id,
          oi.product_id,
          oi.product_name,
          oi.ordered_quantity,
          oi.ordered_unit,
          oi.converted_quantity,
          oi.base_unit,
          oi.price_per_base_unit,
          oi.item_total_price
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN users v   ON o.vendor_id = v.id
        ORDER BY o.created_at DESC, o.id DESC
      `;
    } else {
      return await sql`
        SELECT
          o.id           AS order_id,
          o.seller_id,
          o.seller_name,
          o.status,
          o.total_price,
          o.created_at,
          o.order_type,
          o.vendor_id,
          v.name         AS vendor_name,
          oi.id          AS item_id,
          oi.product_id,
          oi.product_name,
          oi.ordered_quantity,
          oi.ordered_unit,
          oi.converted_quantity,
          oi.base_unit,
          oi.price_per_base_unit,
          oi.item_total_price
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN users v   ON o.vendor_id = v.id
        WHERE o.seller_id = ${userId}
        ORDER BY o.created_at DESC, o.id DESC
      `;
    }
  }

  /**
   * Creates a new parent order record.
   * Supports both 'procurement' (seller←admin) and 'sale' (customer←seller) types.
   * vendor_id is null for procurement, seller's user ID for sales.
   */
  static async createOrder(userId, username, totalPrice, orderType = 'procurement', vendorId = null) {
    const result = await sql`
      INSERT INTO orders (seller_id, seller_name, total_price, status, order_type, vendor_id)
      VALUES (${userId}, ${username}, ${totalPrice}, 'pending', ${orderType}, ${vendorId})
      RETURNING id, seller_id, seller_name, total_price, status, created_at, order_type, vendor_id
    `;
    return result[0];
  }

  /**
   * Inserts an order item record.
   */
  static async createOrderItem(orderId, itemData) {
    const {
      productId, productName, orderedQuantity, orderedUnit,
      convertedQuantity, baseUnit, pricePerBaseUnit, itemTotalPrice
    } = itemData;
    await sql`
      INSERT INTO order_items (
        order_id, product_id, product_name, ordered_quantity, ordered_unit,
        converted_quantity, base_unit, price_per_base_unit, item_total_price
      ) VALUES (
        ${orderId}, ${productId}, ${productName}, ${orderedQuantity}, ${orderedUnit},
        ${convertedQuantity}, ${baseUnit}, ${pricePerBaseUnit}, ${itemTotalPrice}
      )
    `;
  }

  /**
   * Updates an order status field.
   */
  static async updateOrderStatus(orderId, status) {
    const result = await sql`
      UPDATE orders SET status = ${status} WHERE id = ${orderId} RETURNING *
    `;
    return result.length > 0 ? result[0] : null;
  }
}
