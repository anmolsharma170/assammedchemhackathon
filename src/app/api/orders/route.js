import { OrderController } from '@/controllers/OrderController';

export async function GET(request) {
  return await OrderController.getOrders(request);
}

export async function POST(request) {
  return await OrderController.placeOrder(request);
}

