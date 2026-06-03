import { OrderController } from '@/controllers/OrderController';

export async function PUT(request, { params }) {
  const { id } = await params;
  return await OrderController.updateOrderStatus(request, id);
}

