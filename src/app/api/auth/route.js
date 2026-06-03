import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { signSession, verifySession } from '@/lib/auth-crypto';
import bcrypt from 'bcryptjs';

// GET: Check current user session
export async function GET(request) {
  const sessionCookie = request.cookies.get('session');
  const sessionToken = sessionCookie?.value;
  
  const sessionPayload = await verifySession(sessionToken);
  
  if (!sessionPayload) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  
  try {
    // Get latest profile details
    const users = await sql`SELECT id, username, role, name FROM users WHERE id = ${sessionPayload.userId}`;
    if (users.length === 0) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    return NextResponse.json({ user: users[0] }, { status: 200 });
  } catch (error) {
    console.error("GET auth session error:", error);
    return NextResponse.json({ error: "Failed to check session" }, { status: 500 });
  }
}

// POST: Login
export async function POST(request) {
  try {
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }
    
    // Find user in DB
    const users = await sql`SELECT * FROM users WHERE username = ${username}`;
    if (users.length === 0) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    
    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    
    // Create session token
    const sessionToken = await signSession({
      userId: user.id,
      username: user.username,
      role: user.role
    });
    
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username, role: user.role, name: user.name }
    }, { status: 200 });
    
    // Set secure HTTP-only session cookie
    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 // 24 hours
    });
    
    return response;
  } catch (error) {
    console.error("POST login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" }, { status: 200 });
  
  response.cookies.set('session', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  });
  
  return response;
}
