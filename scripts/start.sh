#!/bin/sh
set -e

echo "Running database migrations..."
node -e "
const { runMigrations } = require('./src/lib/db');
runMigrations()
  .then((applied) => {
    console.log('Migrations complete. Applied:', applied.length);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
"

echo "Starting Next.js server..."
exec node server.js
