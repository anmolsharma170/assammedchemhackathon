import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth-crypto';
import { AuthService } from '@/services/authService';

export class AuthController {
  /**
   * Translates check session GET request.
   */
  static async checkSession(request) {
    const sessionCookie = request.cookies.get('session');
    const sessionToken = sessionCookie?.value;
    
    const sessionPayload = await verifySession(sessionToken);
    if (!sessionPayload) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    
    try {
      const user = await AuthService.verifySessionUser(sessionPayload.userId);
      return NextResponse.json({ user }, { status: 200 });
    } catch (error) {
      console.error("GET auth session error:", error);
      return NextResponse.json({ error: "Failed to check session" }, { status: 500 });
    }
  }

  /**
   * Translates login POST request.
   */
  static async login(request) {
    try {
      const { username, password } = await request.json();
      
      if (!username || !password) {
        return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
      }
      
      const user = await AuthService.authenticateUser(username, password);
      if (!user) {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
      }
      
      const response = NextResponse.json({ success: true, user }, { status: 200 });
      await AuthService.createSessionCookie(user, response);
      
      return response;
    } catch (error) {
      console.error("POST login error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  /**
   * Translates logout DELETE request.
   */
  static async logout() {
    const response = NextResponse.json({ success: true, message: "Logged out successfully" }, { status: 200 });
    AuthService.clearSessionCookie(response);
    return response;
  }
}
