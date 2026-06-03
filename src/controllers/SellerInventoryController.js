import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { SellerInventoryService } from '@/services/sellerInventoryService';

export class SellerInventoryController {
  /**
   * GET /api/seller-inventory
   * - Customers: returns all seller listings (all sellers with stock > 0)
   * - Sellers: returns their own stock only
   * - Admin: returns all listings
   */
  static async getListings(request) {
    const sessionCookie = request.cookies.get('session');
    const user = await verifySession(sessionCookie?.value);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      let listings;
      if (user.role === 'seller') {
        // Seller sees their own stock panel
        listings = await SellerInventoryService.getSellerStock(user.userId);
      } else {
        // Customers and admins see all seller listings
        listings = await SellerInventoryService.getAllListings();
      }
      return NextResponse.json({ listings }, { status: 200 });
    } catch (error) {
      console.error('GET seller-inventory error:', error);
      return NextResponse.json({ error: 'Failed to fetch seller inventory' }, { status: 500 });
    }
  }
}
