import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  // Let it fail gracefully or log a descriptive error
  console.error("DATABASE_URL is not configured. Database operations will fail.");
}

export const sql = neon(databaseUrl || '');
