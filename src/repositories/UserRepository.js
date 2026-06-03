import { sql } from '@/lib/db';

export class UserRepository {
  /**
   * Fetches user record by ID.
   */
  static async findById(id) {
    const users = await sql`SELECT id, username, password_hash, role, name FROM users WHERE id = ${id}`;
    return users.length > 0 ? users[0] : null;
  }

  /**
   * Fetches user record by username.
   */
  static async findByUsername(username) {
    const users = await sql`SELECT id, username, password_hash, role, name FROM users WHERE username = ${username}`;
    return users.length > 0 ? users[0] : null;
  }
}
