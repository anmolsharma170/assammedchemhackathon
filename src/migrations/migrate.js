const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is missing.");
  console.error("Please add DATABASE_URL=your_neon_connection_string in .env.local");
  process.exit(1);
}

async function migrate() {
  const sql = neon(databaseUrl);
  console.log("Starting database migrations...");

  try {
    const migrationPath = path.resolve(__dirname, '001_init.sql');
    const sqlText = fs.readFileSync(migrationPath, 'utf8');

    console.log("Executing 001_init.sql statements sequentially...");
    const statements = sqlText
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    for (let i = 0; i < statements.length; i++) {
      await sql.query(statements[i]);
    }

    console.log("Database migrations completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
