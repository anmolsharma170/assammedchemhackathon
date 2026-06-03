import { SellerInventoryController } from '@/controllers/SellerInventoryController';

export async function GET(request) {
  return await SellerInventoryController.getListings(request);
}
