#!/usr/bin/env node

/**
 * Standalone migration runner.
 * Runs SQL migration files from the migrations/ directory against PostgreSQL.
 * Uses DATABASE_URL from environment or .env file.
 *
 * Usage:
 *   node scripts/migrate.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env file if present
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '..', 'migrations');

  // Create tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get applied migrations
  const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
  const appliedSet = new Set(applied.rows.map((row) => row.name));

  // Read migration files
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const executed = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  Skipping (already applied): ${file}`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      executed.push(file);
      console.log(`  Applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAILED: ${file}`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  return executed;
}

async function main() {
  console.log('Running database migrations...');
  console.log(`  Database: ${DATABASE_URL.replace(/\/\/.*:.*@/, '//***:***@')}`);
  console.log('');

  try {
    const applied = await runMigrations();
    console.log('');
    if (applied.length === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Done. Applied ${applied.length} migration(s).`);
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
