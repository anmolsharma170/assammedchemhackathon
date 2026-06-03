import { NextResponse } from 'next/server';
import { verifySession } from './lib/auth-crypto';

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Retrieve session cookie
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  
  // Verify session
  const user = await verifySession(sessionToken);

  // Helper to redirect based on user role
  const redirectToDashboard = (role) => {
    if (role === 'admin') return new URL('/admin', request.url);
    if (role === 'seller') return new URL('/seller', request.url);
    return new URL('/user', request.url); // Default 'user' role
  };

  // Admin routes access control
  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role !== 'admin') {
      return NextResponse.redirect(redirectToDashboard(user.role));
    }
  }

  // Seller routes access control
  if (pathname.startsWith('/seller')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role !== 'seller') {
      return NextResponse.redirect(redirectToDashboard(user.role));
    }
  }

  // User (Customer) routes access control
  if (pathname.startsWith('/user')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role !== 'user') {
      return NextResponse.redirect(redirectToDashboard(user.role));
    }
  }

  // Redirect authenticated users trying to access login page
  if (pathname === '/login') {
    if (user) {
      return NextResponse.redirect(redirectToDashboard(user.role));
    }
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
