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
   * Fetches orders with joined items, filtered optionally by user ID.
   */
  static async findAllWithItems(userId = null, role = 'admin') {
    if (role === 'admin') {
      return await sql`
        SELECT 
          o.id AS order_id,
          o.seller_id,
          o.seller_name,
          o.status,
          o.total_price,
          o.created_at,
          oi.id AS item_id,
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
        ORDER BY o.created_at DESC, o.id DESC
      `;
    } else {
      return await sql`
        SELECT 
          o.id AS order_id,
          o.seller_id,
          o.seller_name,
          o.status,
          o.total_price,
          o.created_at,
          oi.id AS item_id,
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
        WHERE o.seller_id = ${userId}
        ORDER BY o.created_at DESC, o.id DESC
      `;
    }
  }

  /**
   * Creates a new parent order record.
   */
  static async createOrder(userId, username, totalPrice) {
    const result = await sql`
      INSERT INTO orders (seller_id, seller_name, total_price, status)
      VALUES (${userId}, ${username}, ${totalPrice}, 'pending')
      RETURNING id, seller_id, seller_name, total_price, status, created_at
    `;
    return result[0];
  }

  /**
   * Inserts an order item record.
   */
  static async createOrderItem(orderId, itemData) {
    const { productId, productName, orderedQuantity, orderedUnit, convertedQuantity, baseUnit, pricePerBaseUnit, itemTotalPrice } = itemData;
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
