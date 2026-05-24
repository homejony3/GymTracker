import { Pool, PoolConfig } from 'pg';
import fs from 'fs';
import path from 'path';

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

/**
 * Shared PostgreSQL connection pool.
 * Uses DATABASE_URL environment variable for connection configuration.
 */
export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

/**
 * Runs a simple SELECT 1 query to verify database connectivity.
 * Returns true if the database is reachable, false otherwise.
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

/**
 * Simple migration runner that:
 * 1. Creates a _migrations tracking table if it doesn't exist
 * 2. Reads SQL files from the migrations/ directory
 * 3. Sorts them by filename (alphabetical order)
 * 4. Executes any that haven't been applied yet
 *
 * Each migration runs in its own transaction.
 */
export async function runMigrations(migrationsDir?: string): Promise<string[]> {
  const dir = migrationsDir ?? path.resolve(process.cwd(), 'migrations');

  // Ensure the _migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get list of already-applied migrations
  const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
  const appliedSet = new Set(applied.rows.map((row) => row.name));

  // Read migration files from directory
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const executed: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    const filePath = path.join(dir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations (name) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      executed.push(file);
      console.log(`Migration applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Migration failed: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  if (executed.length === 0) {
    console.log('No new migrations to apply.');
  }

  return executed;
}
