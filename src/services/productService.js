import { ProductRepository } from '@/repositories/ProductRepository';

export class ProductService {
  /**
   * Retrieves products using Repository.
   */
  static async getProducts(query = '', category = '') {
    return await ProductRepository.findAll(query, category);
  }

  /**
   * Retrieves a product by ID.
   */
  static async getProductById(id) {
    return await ProductRepository.findById(id);
  }

  /**
   * Validates if a SKU code exists.
   */
  static async checkSkuExists(sku, excludeId = null) {
    const product = await ProductRepository.findBySku(sku, excludeId);
    return product !== null;
  }

  /**
   * Creates a product.
   */
  static async createProduct(productData) {
    return await ProductRepository.create(productData);
  }

  /**
   * Updates an existing product.
   */
  static async updateProduct(id, productData) {
    return await ProductRepository.update(id, productData);
  }

  /**
   * Deletes a product.
   */
  static async deleteProduct(id) {
    return await ProductRepository.delete(id);
  }
}
