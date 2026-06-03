import { NextResponse } from 'next/server';
import { verifySession } from './lib/auth-crypto';
import { handleRbac } from './middlewares/rbacMiddleware';

export async function middleware(request) {
  // Retrieve session cookie
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  
  // Verify session
  const user = await verifySession(sessionToken);

  // Apply Role-Based Access Control logic
  const rbacResponse = handleRbac(request, user);
  if (rbacResponse) {
    return rbacResponse;
  }

  return NextResponse.next();
}

// Apply middleware to dashboards and login routes
export const config = {
  matcher: [
    '/admin/:path*',
    '/seller/:path*',
    '/user/:path*',
    '/login'
  ]
};
