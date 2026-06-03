import { OrderRepository } from '@/repositories/OrderRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { convertQuantity } from '@/lib/conversions';

export class OrderService {
  /**
   * Retrieves orders via OrderRepository.
   */
  static async getOrders(userId = null, role = 'admin') {
    const rows = await OrderRepository.findAllWithItems(userId, role);
    
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
   * Places order: retrieves products, runs conversions, inserts orders/items,
   * and adjusts inventory levels via Repositories.
   */
  static async placeOrder(userId, username, items) {
    const productIds = items.map(item => item.productId);
    const dbProducts = await ProductRepository.findByIds(productIds);
    
    const productsMap = {};
    for (const p of dbProducts) {
      productsMap[p.id] = p;
    }

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

      const convertedQty = convertQuantity(qty, item.orderedUnit, product.base_unit, product.dimension);

      const currentInventory = parseFloat(product.inventory);
      if (convertedQty > currentInventory) {
        throw new Error(`Insufficient inventory for ${product.name}. Requested: ${qty} ${item.orderedUnit} (${convertedQty.toFixed(4)} ${product.base_unit}), Available: ${currentInventory.toFixed(4)} ${product.base_unit}`);
      }

      const pricePerBase = parseFloat(product.base_price);
      const itemTotalPrice = convertedQty * pricePerBase;
      orderTotalPrice += itemTotalPrice;

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        orderedQuantity: qty,
        orderedUnit: item.orderedUnit,
        convertedQuantity: convertedQty,
        baseUnit: product.base_unit,
        pricePerBaseUnit: pricePerBase,
        itemTotalPrice,
        originalProduct: product
      });
    }

    // Write to Repository
    const order = await OrderRepository.createOrder(userId, username, orderTotalPrice);
    const orderId = order.id;

    for (const val of validatedItems) {
      await OrderRepository.createOrderItem(orderId, val);
      
      const newInventory = parseFloat(val.originalProduct.inventory) - val.convertedQuantity;
      await ProductRepository.updateInventory(val.productId, newInventory);
    }

    return { orderId, totalPrice: orderTotalPrice };
  }

  /**
   * Evaluates order status changes, handles inventory recovery/deductions via Repositories.
   */
  static async updateOrderStatus(orderId, status) {
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const oldStatus = order.status;
    if (oldStatus === status) {
      return order;
    }

    const items = await OrderRepository.findItemsByOrderId(orderId);

    // Stock adjustments
    if (oldStatus !== 'rejected' && status === 'rejected') {
      // Recover stock
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        if (product) {
          const newInventory = parseFloat(product.inventory) + parseFloat(item.converted_quantity);
          await ProductRepository.updateInventory(item.product_id, newInventory);
        }
      }
    } else if (oldStatus === 'rejected' && status !== 'rejected') {
      // Re-deduct stock
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        if (!product) {
          throw new Error(`Product ${item.product_name} no longer exists`);
        }
        const currentStock = parseFloat(product.inventory);
        if (currentStock < parseFloat(item.converted_quantity)) {
          throw new Error(`Cannot reactivate order: Insufficient stock for product ${product.name}. Required: ${item.converted_quantity}, Available: ${currentStock}`);
        }
      }
      
      for (const item of items) {
        const product = await ProductRepository.findById(item.product_id);
        const newInventory = parseFloat(product.inventory) - parseFloat(item.converted_quantity);
        await ProductRepository.updateInventory(item.product_id, newInventory);
      }
    }

    return await OrderRepository.updateOrderStatus(orderId, status);
  }
}
