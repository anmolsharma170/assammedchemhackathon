import { ProductController } from '@/controllers/ProductController';

export async function PUT(request, { params }) {
  const { id } = await params;
  return await ProductController.updateProduct(request, id);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  return await ProductController.deleteProduct(request, id);
}

