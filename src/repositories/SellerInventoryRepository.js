import { sql } from '@/lib/db';

export class SellerInventoryRepository {
  /**
   * Returns all seller inventory rows joined with product and seller info.
   * Used by customers to browse what sellers have stocked.
   */
  static async findAll() {
    return await sql`
      SELECT
        si.id,
        si.seller_id,
        u.name        AS seller_name,
        si.product_id,
        p.name        AS product_name,
        p.sku,
        p.description,
        p.category,
        p.dimension,
        p.base_unit,
        si.quantity,
        si.selling_price,
        si.updated_at
      FROM seller_inventory si
      JOIN users    u ON si.seller_id  = u.id
      JOIN products p ON si.product_id = p.id
      WHERE si.quantity > 0
      ORDER BY u.name ASC, p.name ASC
    `;
  }

  /**
   * Returns a single seller's inventory rows.
   * Used by the seller dashboard to show their own stock.
   */
  static async findBySeller(sellerId) {
    return await sql`
      SELECT
        si.id,
        si.seller_id,
        si.product_id,
        p.name        AS product_name,
        p.sku,
        p.category,
        p.dimension,
        p.base_unit,
        si.quantity,
        si.selling_price,
        si.updated_at
      FROM seller_inventory si
      JOIN products p ON si.product_id = p.id
      WHERE si.seller_id = ${sellerId}
      ORDER BY p.name ASC
    `;
  }

  /**
   * Returns a single seller_inventory row by seller + product.
   */
  static async findBySellerAndProduct(sellerId, productId) {
    const rows = await sql`
      SELECT * FROM seller_inventory
      WHERE seller_id = ${sellerId} AND product_id = ${productId}
    `;
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Upserts stock for a seller + product.
   * When admin approves a procurement order, this credits the seller's inventory.
   * selling_price defaults to the product's base_price (can be updated later).
   */
  static async creditStock(sellerId, productId, quantityToAdd, defaultSellingPrice) {
    await sql`
      INSERT INTO seller_inventory (seller_id, product_id, quantity, selling_price, updated_at)
      VALUES (${sellerId}, ${productId}, ${quantityToAdd}, ${defaultSellingPrice}, CURRENT_TIMESTAMP)
      ON CONFLICT (seller_id, product_id)
      DO UPDATE SET
        quantity      = seller_inventory.quantity + ${quantityToAdd},
        updated_at    = CURRENT_TIMESTAMP
    `;
  }

  /**
   * Deducts stock when a customer places a sale order from this seller.
   */
  static async deductStock(sellerId, productId, quantityToDeduct) {
    await sql`
      UPDATE seller_inventory
      SET quantity   = quantity - ${quantityToDeduct},
          updated_at = CURRENT_TIMESTAMP
      WHERE seller_id  = ${sellerId}
        AND product_id = ${productId}
    `;
  }

  /**
   * Restores stock if a sale order is rejected/reversed.
   */
  static async restoreStock(sellerId, productId, quantityToRestore) {
    await sql`
      UPDATE seller_inventory
      SET quantity   = quantity + ${quantityToRestore},
          updated_at = CURRENT_TIMESTAMP
      WHERE seller_id  = ${sellerId}
        AND product_id = ${productId}
    `;
  }

  /**
   * Updates the selling price a seller charges for a product.
   */
  static async updateSellingPrice(sellerId, productId, newPrice) {
    const result = await sql`
      UPDATE seller_inventory
      SET selling_price = ${newPrice}, updated_at = CURRENT_TIMESTAMP
      WHERE seller_id  = ${sellerId}
        AND product_id = ${productId}
      RETURNING *
    `;
    return result.length > 0 ? result[0] : null;
  }
}
