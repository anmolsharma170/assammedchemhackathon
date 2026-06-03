import { NextResponse } from 'next/server';

/**
 * Helper to determine dashboard redirect URL based on user role.
 */
export function getDashboardRedirectUrl(role, requestUrl) {
  if (role === 'admin') return new URL('/admin', requestUrl);
  if (role === 'seller') return new URL('/seller', requestUrl);
  return new URL('/user', requestUrl); // Default 'user' role
}

/**
 * Handles role-based access control (RBAC) redirection checks.
 * Returns a NextResponse redirect if verification fails or matches redirect criteria, otherwise returns null.
 */
export function handleRbac(request, user) {
  const { pathname } = request.nextUrl;

  // Admin routes access control
  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role !== 'admin') {
      return NextResponse.redirect(getDashboardRedirectUrl(user.role, request.url));
    }
  }

  // Seller routes access control
  if (pathname.startsWith('/seller')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role !== 'seller') {
      return NextResponse.redirect(getDashboardRedirectUrl(user.role, request.url));
    }
  }

  // User (Customer) routes access control
  if (pathname.startsWith('/user')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user.role !== 'user') {
      return NextResponse.redirect(getDashboardRedirectUrl(user.role, request.url));
    }
  }

  // Redirect authenticated users trying to access login page
  if (pathname === '/login') {
    if (user) {
      return NextResponse.redirect(getDashboardRedirectUrl(user.role, request.url));
    }
  }

  return null;
}
