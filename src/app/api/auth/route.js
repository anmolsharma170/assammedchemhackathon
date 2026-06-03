import { AuthController } from '@/controllers/AuthController';

export async function GET(request) {
  return await AuthController.checkSession(request);
}

export async function POST(request) {
  return await AuthController.login(request);
}

export async function DELETE() {
  return await AuthController.logout();
}

