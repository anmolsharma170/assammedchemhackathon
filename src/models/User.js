export class User {
  constructor({ id, username, password_hash, role, name }) {
    this.id = id;
    this.username = username;
    this.password_hash = password_hash;
    this.role = role;
    this.name = name;
  }

  /**
   * Validates user structural constraints.
   */
  static validate(userData) {
    const { username, role, name } = userData;
    if (!username || typeof username !== 'string' || username.trim() === '') {
      throw new Error("Username must be a valid non-empty string");
    }
    if (!role || !['admin', 'seller', 'user'].includes(role)) {
      throw new Error("Role must be one of: admin, seller, user");
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error("Name must be a valid non-empty string");
    }
    return true;
  }
}
