import { sql } from '@/lib/db';
import { convertQuantity } from '@/lib/conversions';

export class OrderService {
  /**
   * Retrieves all orders (Admin role) or a specific user's orders,
   * grouping item listings into a structured JSON list.
   */
  static async getOrders(userId = null, role = 'admin') {
    let rows;
    if (role === 'admin') {
      rows = await sql`
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
      rows = await sql`
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

    // Group rows into structured orders
    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          id: row.order_id,
          sellerId: row.seller_id,
          sellerName: row.seller_name,
          status: row.status,
          totalPrice: parseFloat(row.total_price),
          createdAt: row.created_at,
          items: []
        };
      }
      ordersMap[row.order_id].items.push({
        id: row.item_id,
        productId: row.product_id,
        productName: row.product_name,
        orderedQuantity: parseFloat(row.ordered_quantity),
        orderedUnit: row.ordered_unit,
        convertedQuantity: parseFloat(row.converted_quantity),
        baseUnit: row.base_unit,
        pricePerBaseUnit: parseFloat(row.price_per_base_unit),
        itemTotalPrice: parseFloat(row.item_total_price)
      });
    }

    return Object.values(ordersMap).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Validates cart items, performs unit conversions, verifies inventory,
   * inserts order records, and reduces stock levels.
   */
  static async placeOrder(userId, username, items) {
    // Fetch products involved
    const productIds = items.map(item => item.productId);
    const dbProducts = await sql`
      SELECT * FROM products WHERE id = ANY(${productIds})
    `;
    const productsMap = {};
    for (const p of dbProducts) {
      productsMap[p.id] = p;
    }

    // Validate all items and calculate totals first
    const validatedItems = [];
    let orderTotalPrice = 0;

    for (const item of items) {
      const product = productsMap[item.productId];
      if (!product) {
        throw new Error(`Product with ID ${item.productId} not found`);
      }

      const qty = parseFloat(item.orderedQuantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Invalid quantity for product ${product.name}`);
      }

      // Convert quantity to base unit
      const convertedQty = convertQuantity(qty, item.orderedUnit, product.base_unit, product.dimension);

      // Check stock availability
      const currentInventory = parseFloat(product.inventory);
      if (convertedQty > currentInventory) {
        throw new Error(`Insufficient inventory for ${product.name}. Requested: ${qty} ${item.orderedUnit} (${convertedQty.toFixed(4)} ${product.base_unit}), Available: ${currentInventory.toFixed(4)} ${product.base_unit}`);
      }

      const pricePerBase = parseFloat(product.base_price);
      const itemTotalPrice = convertedQty * pricePerBase;
      orderTotalPrice += itemTotalPrice;

      validatedItems.push({
        product,
        orderedQuantity: qty,
        orderedUnit: item.orderedUnit,
        convertedQuantity: convertedQty,
        baseUnit: product.base_unit,
        pricePerBaseUnit: pricePerBase,
        itemTotalPrice
      });
    }

    // Insert Order parent
    const orderResult = await sql`
      INSERT INTO orders (seller_id, seller_name, total_price, status)
      VALUES (${userId}, ${username}, ${orderTotalPrice}, 'pending')
      RETURNING id
    `;
    const orderId = orderResult[0].id;

    // Insert items and adjust stock
    for (const val of validatedItems) {
      await sql`
        INSERT INTO order_items (
          order_id, product_id, product_name, ordered_quantity, ordered_unit, 
          converted_quantity, base_unit, price_per_base_unit, item_total_price
        ) VALUES (
          ${orderId}, ${val.product.id}, ${val.product.name}, ${val.orderedQuantity}, ${val.orderedUnit},
          ${val.convertedQuantity}, ${val.baseUnit}, ${val.pricePerBaseUnit}, ${val.itemTotalPrice}
        )
      `;

      // Deduct inventory
      const newInventory = parseFloat(val.product.inventory) - val.convertedQuantity;
      await sql`
        UPDATE products 
        SET inventory = ${newInventory}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${val.product.id}
      `;
    }

    return { orderId, totalPrice: orderTotalPrice };
  }

  /**
   * Handles transitioning order statuses and dynamics of inventory recovery.
   */
  static async updateOrderStatus(orderId, status) {
    const orders = await sql`SELECT * FROM orders WHERE id = ${orderId}`;
    if (orders.length === 0) {
      throw new Error("Order not found");
    }

    const order = orders[0];
    const oldStatus = order.status;

    if (oldStatus === status) {
      return order;
    }

    const items = await sql`SELECT * FROM order_items WHERE order_id = ${orderId}`;

    // Handle inventory restorations and deductions
    if (oldStatus !== 'rejected' && status === 'rejected') {
      // Restore stock
      for (const item of items) {
        await sql`
          UPDATE products 
          SET inventory = inventory + ${item.converted_quantity}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${item.product_id}
        `;
      }
    } else if (oldStatus === 'rejected' && status !== 'rejected') {
      // Re-deduct stock. Verify stock levels first.
      for (const item of items) {
        const products = await sql`SELECT inventory, name FROM products WHERE id = ${item.product_id}`;
        if (products.length === 0) {
          throw new Error(`Product ${item.product_name} no longer exists`);
        }
        const currentStock = parseFloat(products[0].inventory);
        if (currentStock < parseFloat(item.converted_quantity)) {
          throw new Error(`Cannot reactivate order: Insufficient stock for product ${products[0].name}. Required: ${item.converted_quantity}, Available: ${currentStock}`);
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

    // Update status in orders table
    const result = await sql`
      UPDATE orders SET status = ${status} WHERE id = ${orderId} RETURNING *
    `;
    return result[0];
  }
}
