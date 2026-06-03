import { NextResponse } from 'next/server';
import { verifySession } from './lib/auth-crypto';

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Retrieve session cookie
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  
  // Verify session
  const user = await verifySession(sessionToken);

  // Admin routes access control
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    if (user.role !== 'admin') {
      const sellerUrl = new URL('/seller', request.url);
      return NextResponse.redirect(sellerUrl);
    }
  }

  // Seller routes access control
  if (pathname.startsWith('/seller')) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    if (user.role !== 'seller') {
      const adminUrl = new URL('/admin', request.url);
      return NextResponse.redirect(adminUrl);
    }
  }

  // Redirect authenticated users trying to access login page
  if (pathname === '/login') {
    if (user) {
      if (user.role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url));
      } else if (user.role === 'seller') {
        return NextResponse.redirect(new URL('/seller', request.url));
      }
    }
  }

  return NextResponse.next();
}

// Apply middleware to dashboards and login routes
export const config = {
  matcher: [
    '/admin/:path*',
    '/seller/:path*',
    '/login'
  ]
};
