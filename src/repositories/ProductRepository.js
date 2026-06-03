import { sql } from '@/lib/db';

export class ProductRepository {
  /**
   * Retrieves products with filters.
   */
  static async findAll(query = '', category = '') {
    if (category && category !== 'All') {
      return await sql`
        SELECT * FROM products 
        WHERE (name ILIKE ${'%' + query + '%'} OR sku ILIKE ${'%' + query + '%'})
          AND category = ${category}
        ORDER BY name ASC
      `;
    } else {
      return await sql`
        SELECT * FROM products 
        WHERE name ILIKE ${'%' + query + '%'} OR sku ILIKE ${'%' + query + '%'}
        ORDER BY name ASC
      `;
    }
  }

  /**
   * Retrieves a product record by ID.
   */
  static async findById(id) {
    const products = await sql`SELECT * FROM products WHERE id = ${id}`;
    return products.length > 0 ? products[0] : null;
  }

  /**
   * Retrieves multiple product records by array of IDs.
   */
  static async findByIds(ids) {
    return await sql`
      SELECT * FROM products WHERE id = ANY(${ids})
    `;
  }

  /**
   * Finds a product record by SKU, optionally excluding a specific ID.
   */
  static async findBySku(sku, excludeId = null) {
    let result;
    if (excludeId) {
      result = await sql`SELECT id, name, sku FROM products WHERE sku = ${sku} AND id <> ${excludeId}`;
    } else {
      result = await sql`SELECT id, name, sku FROM products WHERE sku = ${sku}`;
    }
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Inserts a new product record.
   */
  static async create(productData) {
    const { name, sku, description, category, dimension, base_unit, base_price, inventory } = productData;
    const result = await sql`
      INSERT INTO products (name, sku, description, category, dimension, base_unit, base_price, inventory)
      VALUES (${name}, ${sku}, ${description || null}, ${category || 'General'}, ${dimension}, ${base_unit}, ${base_price}, ${inventory})
      RETURNING *
    `;
    return result[0];
  }

  /**
   * Updates an existing product record.
   */
  static async update(id, productData) {
    const { name, sku, description, category, dimension, base_unit, base_price, inventory } = productData;
    const result = await sql`
      UPDATE products
      SET name = ${name},
          sku = ${sku},
          description = ${description || null},
          category = ${category || 'General'},
          dimension = ${dimension},
          base_unit = ${base_unit},
          base_price = ${base_price},
          inventory = ${inventory},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Adjusts the inventory stock count for a product.
   */
  static async updateInventory(id, newInventory) {
    await sql`
      UPDATE products 
      SET inventory = ${newInventory}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
  }

  /**
   * Deletes a product record.
   */
  static async delete(id) {
    const result = await sql`
      DELETE FROM products WHERE id = ${id} RETURNING id
    `;
    return result.length > 0;
  }
}
