import { SellerInventoryRepository } from '@/repositories/SellerInventoryRepository';

export class SellerInventoryService {
  /**
   * Returns all seller listings for the customer catalog.
   * Only rows where quantity > 0 are returned (enforced in repository).
   */
  static async getAllListings() {
    return await SellerInventoryRepository.findAll();
  }

  /**
   * Returns a specific seller's inventory (for their own dashboard panel).
   */
  static async getSellerStock(sellerId) {
    return await SellerInventoryRepository.findBySeller(sellerId);
  }
}
