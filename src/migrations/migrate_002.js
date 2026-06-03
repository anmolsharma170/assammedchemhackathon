/**
 * Migration runner for 002_seller_inventory.sql
 * Run: node src/migrations/migrate_002.js
 * Or:  npm run db:migrate-002
 */
require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  const sqlFile = path.join(__dirname, '002_seller_inventory.sql');
  const sqlText = fs.readFileSync(sqlFile, 'utf8');

  // Split statements by semicolon, skip empty ones
  const statements = sqlText
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log('Running migration 002_seller_inventory...');
  for (const stmt of statements) {
    try {
      await sql.query(stmt);
      console.log('  ✓', stmt.substring(0, 60).replace(/\n/g, ' ') + '...');
    } catch (err) {
      console.error('  ✗ Error:', err.message);
      process.exit(1);
    }
  }
  console.log('Migration 002 complete.');
  process.exit(0);
}

migrate();
