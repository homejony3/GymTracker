#!/usr/bin/env node

/**
 * Create a new user in the Gym Tracker database.
 *
 * Usage:
 *   node scripts/create-user.js <username> <password>
 *
 * Example:
 *   node scripts/create-user.js john mysecurepassword
 *
 * Requires DATABASE_URL environment variable to be set,
 * or run from the project root with a .env file present.
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
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

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

async function main() {
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: node scripts/create-user.js <username> <password>');
    console.error('Example: node scripts/create-user.js john mysecurepassword');
    process.exit(1);
  }

  if (username.length > 50) {
    console.error('Error: Username must be 50 characters or fewer.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is not set.');
    console.error('Set it in your .env file or export it before running this script.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Check if user already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (existing.rows.length > 0) {
      console.error(`Error: User "${username}" already exists.`);
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [username, passwordHash]
    );

    const user = result.rows[0];
    console.log('User created successfully:');
    console.log(`  ID:       ${user.id}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Created:  ${user.created_at}`);
  } catch (error) {
    console.error('Failed to create user:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
