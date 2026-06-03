import { UserRepository } from '@/repositories/UserRepository';
import { signSession } from '@/lib/auth-crypto';
import bcrypt from 'bcryptjs';

export class AuthService {
  /**
   * Retrieves active profile from user ID via Repository.
   */
  static async verifySessionUser(userId) {
    return await UserRepository.findById(userId);
  }

  /**
   * Validates user credentials. Returns profile if correct, null otherwise.
   */
  static async authenticateUser(username, password) {
    const user = await UserRepository.findByUsername(username);
    if (!user) return null;

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
