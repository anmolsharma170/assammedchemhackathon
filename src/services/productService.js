import { sql } from '@/lib/db';

export class ProductService {
  /**
   * Retrieves products using optional query search and category filters.
   */
  static async getProducts(query = '', category = '') {
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
   * Retrieves a single product by ID.
   */
  static async getProductById(id) {
    const products = await sql`SELECT * FROM products WHERE id = ${id}`;
    return products.length > 0 ? products[0] : null;
  }

  /**
   * Checks if a SKU is already present, optionally excluding a specific ID (for editing).
   */
  static async checkSkuExists(sku, excludeId = null) {
    let result;
    if (excludeId) {
      result = await sql`SELECT id FROM products WHERE sku = ${sku} AND id <> ${excludeId}`;
    } else {
      result = await sql`SELECT id FROM products WHERE sku = ${sku}`;
    }
    return result.length > 0;
  }

  /**
   * Creates a new product record.
   */
  static async createProduct(productData) {
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
  static async updateProduct(id, productData) {
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
   * Deletes a product record.
   */
  static async deleteProduct(id) {
    const result = await sql`
      DELETE FROM products WHERE id = ${id} RETURNING id
    `;
    return result.length > 0;
  }
}
