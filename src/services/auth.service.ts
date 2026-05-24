import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '@/lib/db';
import type { User } from '@/types';

/** Number of bcrypt hashing rounds (configurable via env) */
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

/** JWT signing secret */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** JWT token expiry (30 days) */
const TOKEN_EXPIRY = '30d';

/** Maximum consecutive failed login attempts before lockout */
const MAX_FAILED_ATTEMPTS = 5;

/** Lockout window in minutes */
const LOCKOUT_WINDOW_MINUTES = 15;

/**
 * Hash a plaintext password using bcrypt.
 * Rounds configurable via BCRYPT_ROUNDS env var (default: 12).
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Create a JWT token for the given user ID.
 * Token expires after 30 days.
 */
export function createToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify a JWT token and extract the userId.
 * Returns null if the token is invalid or expired.
 */
export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    if (payload && typeof payload.userId === 'string') {
      return { userId: payload.userId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Record a login attempt (success or failure) for a user.
 */
export async function recordLoginAttempt(userId: string, success: boolean): Promise<void> {
  await pool.query(
    'INSERT INTO login_attempts (user_id, success, attempted_at) VALUES ($1, $2, NOW())',
    [userId, success]
  );
}

/**
 * Check if an account is locked due to too many failed login attempts.
 * An account is locked if there are 5 or more consecutive failed attempts
 * within the last 15 minutes (with no successful login in between).
 */
export async function isAccountLocked(userId: string): Promise<boolean> {
  // Get the most recent attempts within the lockout window
  const result = await pool.query(
    `SELECT success, attempted_at
     FROM login_attempts
     WHERE user_id = $1
       AND attempted_at > NOW() - INTERVAL '${LOCKOUT_WINDOW_MINUTES} minutes'
     ORDER BY attempted_at DESC
     LIMIT $2`,
    [userId, MAX_FAILED_ATTEMPTS]
  );

  if (result.rows.length < MAX_FAILED_ATTEMPTS) {
    return false;
  }

  // Check if all recent attempts within the window are failures
  // (if any is a success, the account is not locked)
  return result.rows.every((row) => row.success === false);
}

/**
 * Authenticate a user with username and password.
 * Returns a token and user on success, or an error message on failure.
 * Uses the same error message for wrong username and wrong password (Req 1.2).
 */
export async function authenticate(
  username: string,
  password: string
): Promise<{ token: string; user: User } | { error: string; locked?: boolean }> {
  const GENERIC_ERROR = 'Invalid credentials';

  // Look up user by username
  const userResult = await pool.query(
    'SELECT id, username, password_hash, created_at FROM users WHERE username = $1',
    [username]
  );

  if (userResult.rows.length === 0) {
    // User not found — return same error as wrong password (Req 1.2)
    return { error: GENERIC_ERROR };
  }

  const row = userResult.rows[0];
  const userId: string = row.id;

  // Check if account is locked
  const locked = await isAccountLocked(userId);
  if (locked) {
    return { error: 'Account locked for 15 minutes', locked: true };
  }

  // Verify password
  const valid = await verifyPassword(password, row.password_hash);

  // Record the attempt
  await recordLoginAttempt(userId, valid);

  if (!valid) {
    // Check if this failure triggers a lockout
    const nowLocked = await isAccountLocked(userId);
    if (nowLocked) {
      return { error: 'Account locked for 15 minutes', locked: true };
    }
    return { error: GENERIC_ERROR };
  }

  // Successful authentication
  const token = createToken(userId);
  const user: User = {
    id: userId,
    username: row.username,
    createdAt: new Date(row.created_at),
  };

  return { token, user };
}
