/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FILE: src/services/orderService.js
 * LAYER: Service  (Business Logic)
 *
 * UNIT CONVERSION — SERVER-SIDE ENFORCEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Even though the Seller UI already calls convertQuantity() for a live price
 * preview, the server repeats every conversion here.  This is intentional:
 *   • Prevents tampered API requests (someone could POST arbitrary JSON).
 *   • Ensures the canonical inventory deduction always uses the base unit.
 *   • Keeps business rules out of the HTTP layer (Controllers/Routes).
 *
 * FLOW SUMMARY for placeOrder()
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Fetch the real product records from DB  (base_unit, dimension, base_price,
 *    inventory – all in base units).
 * 2. For each order item:
 *    a. Parse & validate the ordered quantity.
 *    b. Convert from ordered unit → base unit  (convertQuantity).
 *    c. Check that converted quantity ≤ current inventory (base units).
 *    d. Compute item price = convertedQty × base_price.
 * 3. Persist the order and each line-item (storing BOTH the original ordered
 *    qty/unit AND the converted qty/base-unit for audit trail).
 * 4. Deduct converted quantity from inventory (base units).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { convertQuantity } from '@/lib/conversions'; // ← centralised conversion

export class OrderService {
  /**
   * Retrieves orders via OrderRepository.
   * The joined result includes both ordered_unit (what the seller typed) and
   * base_unit (what the DB actually stored) for each line item.
   */
  static async getOrders(userId = null, role = 'admin') {
    const rows = await OrderRepository.findAllWithItems(userId, role);

    // Pivot flat SQL rows into a nested { order → [items] } structure
    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          id: row.order_id,
          sellerId: row.seller_id,
          sellerName: row.seller_name,
          status: row.status,
          totalPrice: parseFloat(row.total_price),  // stored as NUMERIC in DB
          createdAt: row.created_at,
          items: [],
        };
      }
      ordersMap[row.order_id].items.push({
        id: row.item_id,
        productId: row.product_id,
        productName: row.product_name,
        // ── What the seller originally entered ────────────────────────────
        orderedQuantity: parseFloat(row.ordered_quantity),
        orderedUnit: row.ordered_unit,
        // ── What was actually stored / deducted from inventory ────────────
        convertedQuantity: parseFloat(row.converted_quantity), // always in base unit
        baseUnit: row.base_unit,
        // ── Pricing (always per base unit) ────────────────────────────────
        pricePerBaseUnit: parseFloat(row.price_per_base_unit),
        itemTotalPrice: parseFloat(row.item_total_price),
      });
    }

    return Object.values(ordersMap).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  /**
   * placeOrder
   * ─────────────────────────────────────────────────────────────────────────
   * Validates items, runs unit conversions, checks inventory, persists the
   * order, and deducts stock – all in base units.
   *
   * @param {number}   userId   - ID of the authenticated seller
   * @param {string}   username - Seller display name (for order record)
   * @param {Array}    items    - [{ productId, orderedQuantity, orderedUnit }]
   */
  static async placeOrder(userId, username, items) {
    // ── STEP 1: Fetch real product records from DB ─────────────────────────
    // We need base_unit, dimension, base_price, and inventory for each product.
    const productIds = items.map((item) => item.productId);
    const dbProducts = await ProductRepository.findByIds(productIds);

    // Build a map for O(1) lookup by product ID
    const productsMap = {};
    for (const p of dbProducts) {
      productsMap[p.id] = p;
    }

    const validatedItems = [];
    let orderTotalPrice = 0;

    // ── STEP 2: Validate + Convert each line item ──────────────────────────
    for (const item of items) {
      const product = productsMap[item.productId];
      if (!product) {
        throw new Error(`Product with ID ${item.productId} not found`);
      }

      // Parse the quantity the seller typed in the UI
      const qty = parseFloat(item.orderedQuantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Invalid quantity for product ${product.name}`);
      }

      // ── UNIT CONVERSION (core step) ──────────────────────────────────────
      // convertQuantity() reads CONVERSIONS[dimension][orderedUnit][base_unit]
      // and multiplies.
      //
      // Example:  qty=2, orderedUnit='kg', base_unit='g', dimension='weight'
      //   → factor = CONVERSIONS.weight.kg.g = 1000
      //   → convertedQty = 2 × 1000 = 2000  (grams)
      //
      // If the seller already ordered in the base unit (e.g. grams), the
      // factor is 1 and the value is unchanged.
      const convertedQty = convertQuantity(
        qty,
        item.orderedUnit,   // what the seller chose
        product.base_unit,  // DB base unit (e.g. 'g' or 'mL')
        product.dimension   // 'weight' | 'volume' | 'count'
      );

      // ── STEP 3: Inventory check (always in base units) ───────────────────
      // product.inventory is stored in base units in the DB (NUMERIC column).
      const currentInventory = parseFloat(product.inventory);
      if (convertedQty > currentInventory) {
        // Surface a helpful message showing both the user-facing unit and
        // the base-unit equivalent so admins can audit easily.
        throw new Error(
          `Insufficient inventory for ${product.name}. ` +
          `Requested: ${qty} ${item.orderedUnit} ` +
          `(${convertedQty.toFixed(4)} ${product.base_unit}), ` +
          `Available: ${currentInventory.toFixed(4)} ${product.base_unit}`
        );
      }

      // ── STEP 4: Price calculation (always in base units) ─────────────────
      // base_price is stored as ₹ per base unit in the DB (NUMERIC column).
      // Total item price = (quantity in base units) × (price per base unit)
      //
      // Example:  2000 g  ×  ₹0.05/g  =  ₹100
      const pricePerBase = parseFloat(product.base_price);
      const itemTotalPrice = convertedQty * pricePerBase;
      orderTotalPrice += itemTotalPrice;

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        orderedQuantity: qty,           // original user input (display only)
        orderedUnit: item.orderedUnit,  // original unit (display only)
        convertedQuantity: convertedQty, // ← stored in order_items; used for deduction
        baseUnit: product.base_unit,
        pricePerBaseUnit: pricePerBase,
        itemTotalPrice,
        originalProduct: product,
      });
    }

    // ── STEP 5: Persist order + line items ───────────────────────────────────
    // Both ordered_quantity/ordered_unit (display) and
    // converted_quantity/base_unit (storage) are saved so the admin dashboard
    // can show what the seller requested as well as what was deducted.
    const order = await OrderRepository.createOrder(userId, username, orderTotalPrice);
    const orderId = order.id;

    for (const val of validatedItems) {
      await OrderRepository.createOrderItem(orderId, val);

      // ── STEP 6: Deduct inventory (always in base units) ───────────────────
      // We subtract convertedQuantity (base units) from the stored inventory.
      const newInventory =
        parseFloat(val.originalProduct.inventory) - val.convertedQuantity;
      await ProductRepository.updateInventory(val.productId, newInventory);
    }

    return { orderId, totalPrice: orderTotalPrice };
  }

  /**
   * updateOrderStatus
   * ─────────────────────────────────────────────────────────────────────────
   * Handles stock recovery / re-deduction when an order is rejected or
   * reactivated by the admin.
   *
   * INVENTORY ADJUSTMENT RULES:
   *   • pending → rejected : Recover stock  (+convertedQuantity per item)
   *   • rejected → pending : Re-deduct stock (−convertedQuantity per item)
   *   • Any other transition: No stock change.
   *
   * convertedQuantity used here is in base units, matching the stored inventory
   * column, so no additional conversion is needed.
   */
  static async updateOrderStatus(orderId, status) {
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const oldStatus = order.status;
    if (oldStatus === status) {
      return order; // No change
    }

    // Fetch the order line items (converted_quantity is in base units)
    const items = await OrderRepository.findItemsByOrderId(orderId);

    if (oldStatus !== 'rejected' && status === 'rejected') {
      // ── RECOVER STOCK (rejection) ──────────────────────────────────────
      // Add back the base-unit quantity that was deducted when the order
      // was placed.
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        if (product) {
          // converted_quantity already in base units – no conversion needed
          const newInventory =
            parseFloat(product.inventory) + parseFloat(item.converted_quantity);
          await ProductRepository.updateInventory(item.product_id, newInventory);
        }
      }
    } else if (oldStatus === 'rejected' && status !== 'rejected') {
      // ── RE-DEDUCT STOCK (reactivation) ────────────────────────────────
      // First pass: validate all items have sufficient stock (atomic check)
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        if (!product) {
          throw new Error(`Product ${item.product_name} no longer exists`);
        }
        const currentStock = parseFloat(product.inventory);
        if (currentStock < parseFloat(item.converted_quantity)) {
          throw new Error(
            `Cannot reactivate order: Insufficient stock for product ` +
            `${product.name}. ` +
            `Required: ${item.converted_quantity}, Available: ${currentStock}`
          );
        }
      }

      // Second pass: safe to deduct now that all items are validated
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        // Again, converted_quantity is in base units – subtract directly
        const newInventory =
          parseFloat(product.inventory) - parseFloat(item.converted_quantity);
        await ProductRepository.updateInventory(item.product_id, newInventory);
      }
    }

    return await OrderRepository.updateOrderStatus(orderId, status);
  }
}
