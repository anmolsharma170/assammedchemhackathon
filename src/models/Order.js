export class Order {
  constructor({ id, seller_id, seller_name, status, total_price, created_at, items = [] }) {
    this.id = id;
    this.seller_id = seller_id;
    this.seller_name = seller_name;
    this.status = status;
    this.total_price = total_price;
    this.created_at = created_at;
    this.items = items;
  }

  /**
   * Validates structural constraints of order items and quantities.
   */
  static validate(orderData) {
    const { items } = orderData;
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error("Order must contain a list of one or more items");
    }

    for (const item of items) {
      if (!item.productId) {
        throw new Error("Each order item must specify a valid productId");
      }
      const qty = parseFloat(item.orderedQuantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Quantity for product ID ${item.productId} must be a positive number`);
      }
      if (!item.orderedUnit || typeof item.orderedUnit !== 'string' || item.orderedUnit.trim() === '') {
        throw new Error(`Each order item must specify a valid orderedUnit`);
      }
    }

    return true;
  }
}
