import { sql } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signSession } from '@/lib/auth-crypto';

export class AuthService {
  /**
   * Retrieves active profile from user ID.
   */
  static async verifySessionUser(userId) {
    const users = await sql`SELECT id, username, role, name FROM users WHERE id = ${userId}`;
    return users.length > 0 ? users[0] : null;
  }

  /**
   * Validates user credentials. Returns profile if correct, null otherwise.
   */
  static async authenticateUser(username, password) {
    const users = await sql`SELECT * FROM users WHERE username = ${username}`;
    if (users.length === 0) return null;

    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) return null;

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    };
  }

  /**
   * Encodes user session payload into cookie.
   */
  static async createSessionCookie(user, response) {
    const sessionToken = await signSession({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 // 24 hours
    });

    return response;
  }

  /**
   * Invalidates session cookie.
   */
  static clearSessionCookie(response) {
    response.cookies.set('session', '', {
      httpOnly: true,
      expires: new Date(0),
      path: '/'
    });
    return response;
  }
}
