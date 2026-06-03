import { ProductController } from '@/controllers/ProductController';

export async function GET(request) {
  return await ProductController.getProducts(request);
}

export async function POST(request) {
  return await ProductController.createProduct(request);
}

