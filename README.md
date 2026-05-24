# Gym Tracker

A mobile-first web application for tracking gym workouts with progressive overload. Organizes exercises by workout splits (UPPER, LOWER, ARMS), tracks weight (kg), reps, and sets per session, and suggests weight increases based on historical performance.

## Key Features

- **Workout Splits** — Organize exercises into UPPER, LOWER, and ARMS categories
- **Session Logging** — Record weight, reps, and sets for each exercise
- **Progressive Overload** — Automatic weight increase suggestions based on past performance
- **Session History** — View and compare past workouts side-by-side
- **EU Localization** — Kilograms, comma decimals, DD.MM.YYYY dates, 24h time
- **Multi-User** — Separate accounts with full data isolation
- **Self-Hosted** — Runs on your own server via Docker Compose with automatic HTTPS

## Prerequisites

- **Docker** (v20.10+) and **Docker Compose** (v2.0+)
- **A Linux server** (Debian 12+ or Ubuntu 22.04+) — tested on Proxmox VMs
- **A domain or subdomain** with DNS pointing to your server's public IP
- **Ports 80 and 443** open on your firewall (for Caddy's automatic HTTPS)

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url> gym-tracker
cd gym-tracker
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set secure values for each variable (see [Environment Variables](#environment-variables) below).

### 3. Configure your domain

Edit the `Caddyfile` and replace `gym.example.com` with your actual domain:

```
your-domain.com {
    reverse_proxy app:3000
    ...
}
```

### 4. Deploy

```bash
docker compose up -d
```

The application will:
1. Build the Next.js app container
2. Start PostgreSQL and wait for it to be healthy
3. Run database migrations automatically on first start
4. Start serving on port 3000 (behind Caddy on ports 80/443)

### 5. Verify deployment

Check that containers are running:

```bash
docker compose ps
```

Check application health:

```bash
curl -f http://localhost:3000/api/health
```

The health endpoint should return HTTP 200 within 60 seconds of deployment.

### 6. Create your first user

Since there is no registration UI (by design — this is a private app), create users via the CLI script:

```bash
docker compose exec app node scripts/create-user.js <username> <password>
```

Example:

```bash
docker compose exec app node scripts/create-user.js john MySecurePass123
```

See [Initial User Creation](#initial-user-creation) for more details.

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_USER` | PostgreSQL username | `gymtracker` |
| `POSTGRES_PASSWORD` | PostgreSQL password (use a strong random value) | `a7Bx9...` |
| `POSTGRES_DB` | PostgreSQL database name | `gymtracker` |
| `DATABASE_URL` | Full connection string (used by the app) | `postgresql://gymtracker:PASSWORD@db:5432/gymtracker` |
| `JWT_SECRET` | Secret key for signing JWT tokens (use a random 64+ char string) | `randomstring...` |
| `BCRYPT_ROUNDS` | Number of bcrypt hashing rounds (12 recommended) | `12` |

Generate secure random values:

```bash
# Generate JWT_SECRET
openssl rand -base64 48

# Generate POSTGRES_PASSWORD
openssl rand -base64 32
```

## DNS Configuration

1. **Get your server's public IP address:**
   ```bash
   curl -4 ifconfig.me
   ```

2. **Create a DNS A record** pointing your domain/subdomain to the server IP:

   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | A | `gym` (or `@` for root) | `YOUR_SERVER_IP` | 300 |

3. **Wait for DNS propagation** (usually 5–30 minutes):
   ```bash
   dig +short your-domain.com
   ```

4. **Caddy handles TLS automatically** — once DNS resolves to your server, Caddy will obtain a Let's Encrypt certificate on first request. No manual certificate management needed.

### Using Caddy standalone (outside Docker)

If you prefer running Caddy on the host (e.g., to serve multiple apps):

1. Install Caddy on the host: https://caddyserver.com/docs/install
2. Copy the `Caddyfile` to `/etc/caddy/Caddyfile`
3. Update `reverse_proxy` to point to `localhost:3000` instead of `app:3000`
4. Remove port 80/443 mappings from `docker-compose.yml` if Caddy is external
5. Restart Caddy: `sudo systemctl restart caddy`

## Initial User Creation

This application has no public registration — users are created via a CLI script.

### Using the create-user script

```bash
# From the host (container must be running)
docker compose exec app node scripts/create-user.js <username> <password>

# Examples
docker compose exec app node scripts/create-user.js alice SecurePassword123
docker compose exec app node scripts/create-user.js bob AnotherStrongPass!
```

Requirements:
- Username: 1–50 characters, must be unique (case-insensitive)
- Password: minimum 8 characters

### Manual SQL method (alternative)

If you need to create a user directly via SQL:

```bash
# Generate a bcrypt hash (requires Node.js)
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('yourpassword', 12).then(h => console.log(h))"

# Connect to the database
docker compose exec db psql -U gymtracker -d gymtracker

# Insert the user
INSERT INTO users (username, password_hash)
VALUES ('username', '$2a$12$YOUR_GENERATED_HASH_HERE');
```

## Backup and Restore

### Automated daily backups

Create a cron job for automated daily backups:

```bash
# Create backup directory
mkdir -p /opt/gym-tracker-backups

# Add to crontab (runs daily at 02:00)
crontab -e
```

Add this line:

```
0 2 * * * cd /path/to/gym-tracker && docker compose exec -T db pg_dump -U gymtracker gymtracker | gzip > /opt/gym-tracker-backups/gymtracker_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz && find /opt/gym-tracker-backups -name "*.sql.gz" -mtime +7 -delete
```

This will:
- Create a compressed backup every day at 02:00
- Retain backups for 7 days
- Automatically delete older backups

### Manual backup

```bash
docker compose exec -T db pg_dump -U gymtracker gymtracker > backup_$(date +%Y%m%d).sql
```

### Restore from backup

```bash
# Stop the app (keep DB running)
docker compose stop app

# Restore the backup
docker compose exec -T db psql -U gymtracker -d gymtracker < backup_20240101.sql

# Or from a gzipped backup
gunzip -c /opt/gym-tracker-backups/gymtracker_20240101_020000.sql.gz | docker compose exec -T db psql -U gymtracker -d gymtracker

# Restart the app
docker compose start app
```

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or use Docker for the database only)

### Local development

```bash
# Install dependencies
npm install

# Start PostgreSQL (using Docker)
docker compose up db -d

# Set environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL to postgresql://gymtracker:changeme@localhost:5432/gymtracker

# Run development server
npm run dev
```

The app will be available at http://localhost:3000.

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (with Turbopack) |
| `npm run build` | Build production bundle |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

### Running tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a specific test file
npx vitest run tests/unit/format.test.ts
```

### Project structure

```
├── src/
│   ├── app/              # Next.js App Router pages and API routes
│   ├── components/       # React components
│   ├── lib/              # Utilities (db, retry, constants, api-client)
│   ├── services/         # Business logic (auth, exercise, session, etc.)
│   └── types/            # TypeScript type definitions
├── migrations/           # SQL migration files (run in order)
├── scripts/              # CLI utilities (create-user, start)
├── tests/                # Test files (unit, property, integration)
├── docker-compose.yml    # Container orchestration
├── Dockerfile            # Multi-stage production build
├── Caddyfile             # Reverse proxy + TLS configuration
└── .env.example          # Environment variable template
```

## Troubleshooting

### Application won't start

**Symptom:** `docker compose up` fails or the app container keeps restarting.

**Solutions:**
1. Check logs: `docker compose logs app`
2. Verify `.env` file exists and has all required variables
3. Ensure `DATABASE_URL` matches the PostgreSQL credentials
4. Check if port 3000 is already in use: `lsof -i :3000`

### Database connection refused

**Symptom:** App logs show "connection refused" or "ECONNREFUSED".

**Solutions:**
1. Check if the DB container is healthy: `docker compose ps`
2. Wait for PostgreSQL to finish initializing (check healthcheck): `docker compose logs db`
3. Verify `DATABASE_URL` uses `db` as hostname (not `localhost`) when running in Docker
4. Ensure `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` match between services

### Cannot access the app via HTTPS

**Symptom:** Browser shows connection timeout or certificate error.

**Solutions:**
1. Verify DNS resolves to your server: `dig +short your-domain.com`
2. Check that ports 80 and 443 are open: `sudo ufw status` or check your firewall
3. Check Caddy logs: `journalctl -u caddy` (if standalone) or `docker compose logs caddy`
4. Ensure the domain in `Caddyfile` matches your actual domain exactly
5. Wait a few minutes — Let's Encrypt certificate issuance can take up to 2 minutes on first deploy

### Login not working

**Symptom:** Valid credentials are rejected, or "Account locked" message appears.

**Solutions:**
1. Verify the user exists: `docker compose exec db psql -U gymtracker -d gymtracker -c "SELECT username FROM users;"`
2. If account is locked, wait 15 minutes or clear lockout: `docker compose exec db psql -U gymtracker -d gymtracker -c "DELETE FROM login_attempts WHERE user_id = (SELECT id FROM users WHERE username = 'youruser');"`
3. Reset password by creating a new hash and updating: `docker compose exec db psql -U gymtracker -d gymtracker -c "UPDATE users SET password_hash = 'NEW_HASH' WHERE username = 'youruser';"`

### Migrations fail on startup

**Symptom:** App logs show "Migration failed" error.

**Solutions:**
1. Check the specific error in logs: `docker compose logs app | grep -i migration`
2. Ensure the database is empty on first run (migrations expect fresh state)
3. If upgrading, check if a migration was partially applied: `docker compose exec db psql -U gymtracker -d gymtracker -c "SELECT * FROM migrations;"`
4. To reset completely (destroys all data): `docker compose down -v && docker compose up -d`

### High memory usage

**Symptom:** Container uses more than 512 MB RAM.

**Solutions:**
1. Check memory usage: `docker stats`
2. The app is designed for 2 concurrent users — if more are connecting, memory may increase
3. Restart the app container: `docker compose restart app`
4. Set memory limits in `docker-compose.yml`:
   ```yaml
   services:
     app:
       deploy:
         resources:
           limits:
             memory: 512M
   ```

### Data not persisting after restart

**Symptom:** Users/exercises/sessions disappear after `docker compose down`.

**Solutions:**
1. Use `docker compose stop` / `docker compose start` instead of `down` (which removes volumes by default only with `-v`)
2. Verify the named volume exists: `docker volume ls | grep pgdata`
3. Never use `docker compose down -v` unless you intend to delete all data
4. Check that `pgdata` volume is defined in `docker-compose.yml` (it is by default)

## License

Private project. All rights reserved.
