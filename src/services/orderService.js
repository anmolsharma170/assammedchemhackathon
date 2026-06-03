/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FILE: src/services/orderService.js
 * LAYER: Service (Business Logic)
 *
 * TWO ORDER TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 * 'procurement' – Seller buys from Admin's master inventory.
 *   • Deducts from products.inventory (base units).
 *   • When admin APPROVES → credits seller_inventory.
 *   • When admin REJECTS  → restores products.inventory.
 *
 * 'sale'        – Customer buys from a Seller's stocked inventory.
 *   • Deducts from seller_inventory.quantity (base units).
 *   • Auto-approved (or admin can view them; stock is deducted immediately).
 *   • If rejected → restores seller_inventory.quantity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { OrderRepository }           from '@/repositories/OrderRepository';
import { ProductRepository }         from '@/repositories/ProductRepository';
import { SellerInventoryRepository } from '@/repositories/SellerInventoryRepository';
import { convertQuantity }           from '@/lib/conversions';

export class OrderService {
  /**
   * Retrieves orders via OrderRepository, pivoting flat SQL rows into
   * a nested { order → [items] } structure.
   */
  static async getOrders(userId = null, role = 'admin') {
    const rows = await OrderRepository.findAllWithItems(userId, role);

    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          id:          row.order_id,
          sellerId:    row.seller_id,
          sellerName:  row.seller_name,
          status:      row.status,
          totalPrice:  parseFloat(row.total_price),
          createdAt:   row.created_at,
          orderType:   row.order_type,           // 'procurement' | 'sale'
          vendorId:    row.vendor_id,             // seller's ID for sale orders
          vendorName:  row.vendor_name || null,   // seller's display name
          items:       [],
        };
      }
      ordersMap[row.order_id].items.push({
        id:               row.item_id,
        productId:        row.product_id,
        productName:      row.product_name,
        orderedQuantity:  parseFloat(row.ordered_quantity),
        orderedUnit:      row.ordered_unit,
        convertedQuantity: parseFloat(row.converted_quantity),
        baseUnit:         row.base_unit,
        pricePerBaseUnit: parseFloat(row.price_per_base_unit),
        itemTotalPrice:   parseFloat(row.item_total_price),
      });
    }

    return Object.values(ordersMap).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  /**
   * placeOrder
   * ─────────────────────────────────────────────────────────────────────────
   * Routes to the correct stock source based on order_type:
   *   'procurement' → deduct from products.inventory (admin stock)
   *   'sale'        → deduct from seller_inventory (vendor's stock)
   *
   * @param {number} userId      - ID of the user placing the order
   * @param {string} username    - Display name of the user
   * @param {Array}  items       - [{ productId, orderedQuantity, orderedUnit }]
   * @param {string} orderType   - 'procurement' | 'sale'
   * @param {number|null} vendorId - For 'sale': the seller's user ID
   */
  static async placeOrder(userId, username, items, orderType = 'procurement', vendorId = null) {
    if (orderType === 'sale') {
      return await OrderService._placeSaleOrder(userId, username, items, vendorId);
    } else {
      return await OrderService._placeProcurementOrder(userId, username, items);
    }
  }

  /**
   * _placeProcurementOrder  (Seller ← Admin)
   * ─────────────────────────────────────────────────────────────────────────
   * Validates items against master products.inventory, converts units,
   * calculates price, deducts stock, persists order.
   * NOTE: seller_inventory is NOT credited here — that happens when
   * the admin APPROVES the order (in updateOrderStatus).
   */
  static async _placeProcurementOrder(userId, username, items) {
    const productIds = items.map(i => i.productId);
    const dbProducts = await ProductRepository.findByIds(productIds);

    const productsMap = {};
    for (const p of dbProducts) productsMap[p.id] = p;

    const validatedItems = [];
    let orderTotalPrice = 0;

    for (const item of items) {
      const product = productsMap[item.productId];
      if (!product) throw new Error(`Product with ID ${item.productId} not found`);

      const qty = parseFloat(item.orderedQuantity);
      if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for product ${product.name}`);

      // Convert ordered unit → base unit (e.g. 2 kg → 2000 g)
      const convertedQty = convertQuantity(qty, item.orderedUnit, product.base_unit, product.dimension);

      // Check admin inventory (base units)
      const currentInventory = parseFloat(product.inventory);
      if (convertedQty > currentInventory) {
        throw new Error(
          `Insufficient inventory for ${product.name}. ` +
          `Requested: ${qty} ${item.orderedUnit} (${convertedQty.toFixed(4)} ${product.base_unit}), ` +
          `Available: ${currentInventory.toFixed(4)} ${product.base_unit}`
        );
      }

      // Price = converted qty × base_price (₹/base unit)
      const pricePerBase   = parseFloat(product.base_price);
      const itemTotalPrice = convertedQty * pricePerBase;
      orderTotalPrice += itemTotalPrice;

      validatedItems.push({
        productId:        product.id,
        productName:      product.name,
        orderedQuantity:  qty,
        orderedUnit:      item.orderedUnit,
        convertedQuantity: convertedQty,
        baseUnit:         product.base_unit,
        pricePerBaseUnit: pricePerBase,
        itemTotalPrice,
        originalProduct:  product,
      });
    }

    // Persist order (order_type='procurement', vendor_id=null)
    const order   = await OrderRepository.createOrder(userId, username, orderTotalPrice, 'procurement', null);
    const orderId = order.id;

    for (const val of validatedItems) {
      await OrderRepository.createOrderItem(orderId, val);
      // Deduct from admin inventory immediately on order placement
      const newInventory = parseFloat(val.originalProduct.inventory) - val.convertedQuantity;
      await ProductRepository.updateInventory(val.productId, newInventory);
    }

    return { orderId, totalPrice: orderTotalPrice };
  }

  /**
   * _placeSaleOrder  (Customer ← Seller)
   * ─────────────────────────────────────────────────────────────────────────
   * Validates items against seller_inventory, converts units if needed,
   * calculates price at the seller's selling_price, deducts seller stock.
   */
  static async _placeSaleOrder(userId, username, items, vendorId) {
    if (!vendorId) throw new Error('vendor_id is required for sale orders');

    const validatedItems = [];
    let orderTotalPrice  = 0;

    for (const item of items) {
      // Fetch seller's inventory row for this product
      const sellerRow = await SellerInventoryRepository.findBySellerAndProduct(vendorId, item.productId);
      if (!sellerRow) {
        throw new Error(`This product is not available from the selected seller`);
      }

      // Fetch full product record for dimension/base_unit info
      const product = await ProductRepository.findById(item.productId);
      if (!product) throw new Error(`Product with ID ${item.productId} not found`);

      const qty = parseFloat(item.orderedQuantity);
      if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for ${product.name}`);

      // Convert ordered unit → base unit
      const convertedQty = convertQuantity(qty, item.orderedUnit, product.base_unit, product.dimension);

      // Check seller's stock (base units)
      const sellerStock = parseFloat(sellerRow.quantity);
      if (convertedQty > sellerStock) {
        throw new Error(
          `Insufficient stock from seller for ${product.name}. ` +
          `Requested: ${convertedQty.toFixed(4)} ${product.base_unit}, ` +
          `Available: ${sellerStock.toFixed(4)} ${product.base_unit}`
        );
      }

      // Price is the seller's selling_price (per base unit)
      const sellingPrice   = parseFloat(sellerRow.selling_price);
      const itemTotalPrice = convertedQty * sellingPrice;
      orderTotalPrice += itemTotalPrice;

      validatedItems.push({
        productId:        product.id,
        productName:      product.name,
        orderedQuantity:  qty,
        orderedUnit:      item.orderedUnit,
        convertedQuantity: convertedQty,
        baseUnit:         product.base_unit,
        pricePerBaseUnit: sellingPrice,    // seller's price, not admin's
        itemTotalPrice,
        vendorId,
      });
    }

    // Persist order (order_type='sale', vendor_id=vendorId)
    const order   = await OrderRepository.createOrder(userId, username, orderTotalPrice, 'sale', vendorId);
    const orderId = order.id;

    for (const val of validatedItems) {
      await OrderRepository.createOrderItem(orderId, val);
      // Deduct from seller's stock immediately
      await SellerInventoryRepository.deductStock(val.vendorId, val.productId, val.convertedQuantity);
    }

    return { orderId, totalPrice: orderTotalPrice };
  }

  /**
   * updateOrderStatus
   * ─────────────────────────────────────────────────────────────────────────
   * Handles stock adjustments on status transitions:
   *
   * PROCUREMENT orders:
   *   pending → rejected : Restore admin inventory
   *   rejected → pending : Re-deduct admin inventory
   *   pending → approved : Credit seller_inventory (seller now has stock)
   *   approved → rejected: Restore admin inventory, remove seller_inventory credit
   *
   * SALE orders:
   *   pending → rejected : Restore seller_inventory
   *   rejected → pending : Re-deduct seller_inventory
   */
  static async updateOrderStatus(orderId, status) {
    const order = await OrderRepository.findById(orderId);
    if (!order) throw new Error('Order not found');

    const oldStatus = order.status;
    if (oldStatus === status) return order;

    const items     = await OrderRepository.findItemsByOrderId(orderId);
    const orderType = order.order_type || 'procurement';

    if (orderType === 'procurement') {
      await OrderService._handleProcurementStatusChange(order, items, oldStatus, status);
    } else {
      await OrderService._handleSaleStatusChange(order, items, oldStatus, status);
    }

    return await OrderRepository.updateOrderStatus(orderId, status);
  }

  /**
   * Procurement status transitions:
   *   pending → approved  → credit seller_inventory
   *   pending → rejected  → restore admin inventory
   *   approved → rejected → remove seller_inventory credit + restore admin inventory
   *   rejected → pending  → re-deduct admin inventory
   */
  static async _handleProcurementStatusChange(order, items, oldStatus, newStatus) {
    if (oldStatus === 'pending' && newStatus === 'approved') {
      // Admin approved → credit the seller's inventory with purchased quantities
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        if (product) {
          await SellerInventoryRepository.creditStock(
            order.seller_id,
            item.product_id,
            parseFloat(item.converted_quantity),
            parseFloat(product.base_price)   // default selling price = admin cost
          );
        }
      }
    } else if (oldStatus !== 'rejected' && newStatus === 'rejected') {
      // Rejected → restore admin inventory
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        if (product) {
          const newInventory = parseFloat(product.inventory) + parseFloat(item.converted_quantity);
          await ProductRepository.updateInventory(item.product_id, newInventory);
        }
      }
      // If it was previously approved, also remove the seller_inventory credit
      if (oldStatus === 'approved') {
        for (const item of items) {
          await SellerInventoryRepository.deductStock(
            order.seller_id,
            item.product_id,
            parseFloat(item.converted_quantity)
          );
        }
      }
    } else if (oldStatus === 'rejected' && newStatus !== 'rejected') {
      // Reactivated from rejected → re-deduct admin inventory
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        if (!product) throw new Error(`Product ${item.product_name} no longer exists`);
        if (parseFloat(product.inventory) < parseFloat(item.converted_quantity)) {
          throw new Error(`Insufficient admin stock to reactivate: ${product.name}`);
        }
      }
      for (const item of items) {
        const product      = await ProductRepository.findById(item.product_id);
        const newInventory = parseFloat(product.inventory) - parseFloat(item.converted_quantity);
        await ProductRepository.updateInventory(item.product_id, newInventory);
      }
    }
  }

  /**
   * Sale status transitions:
   *   pending → rejected : restore seller_inventory
   *   rejected → pending : re-deduct seller_inventory
   */
  static async _handleSaleStatusChange(order, items, oldStatus, newStatus) {
    if (oldStatus !== 'rejected' && newStatus === 'rejected') {
      // Return stock to seller
      for (const item of items) {
        await SellerInventoryRepository.restoreStock(
          order.vendor_id,
          item.product_id,
          parseFloat(item.converted_quantity)
        );
      }
    } else if (oldStatus === 'rejected' && newStatus !== 'rejected') {
      // Re-deduct from seller
      for (const item of items) {
        const sellerRow = await SellerInventoryRepository.findBySellerAndProduct(
          order.vendor_id, item.product_id
        );
        if (!sellerRow || parseFloat(sellerRow.quantity) < parseFloat(item.converted_quantity)) {
          throw new Error(`Insufficient seller stock to reactivate this sale order`);
        }
        await SellerInventoryRepository.deductStock(
          order.vendor_id,
          item.product_id,
          parseFloat(item.converted_quantity)
        );
      }
    }
  }
}
