import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import {
  createToken,
  verifyToken,
  isAccountLocked,
  authenticate,
} from '@/services/auth.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('AuthService - Boundary and Timing Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Lockout boundary: exactly 5 failed attempts (Req 1.3)', () => {
    it('should NOT lock account after exactly 4 failed attempts within 15 minutes', async () => {
      // Only 4 failures returned — below the threshold
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-boundary');
      expect(locked).toBe(false);
    });

    it('should lock account after exactly 5 failed attempts within 15 minutes', async () => {
      // Exactly 5 failures — at the threshold
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-boundary');
      expect(locked).toBe(true);
    });

    it('should NOT lock account when 5th attempt is a success', async () => {
      // 4 failures + 1 success = not locked
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: true, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-boundary');
      expect(locked).toBe(false);
    });
  });

  describe('Lockout resets after 15 minutes (Req 1.3)', () => {
    it('should NOT lock account when failures are older than 15 minutes', async () => {
      // The query filters by "attempted_at > NOW() - INTERVAL '15 minutes'"
      // so if all old attempts are outside the window, the DB returns fewer rows
      // Simulating: DB returns empty because all attempts are older than 15 min
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const locked = await isAccountLocked('user-timeout');
      expect(locked).toBe(false);
    });

    it('should NOT lock account when only 3 failures are within the 15-minute window (others expired)', async () => {
      // DB only returns attempts within the 15-minute window
      // If old attempts fell outside the window, only recent ones are returned
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-timeout');
      expect(locked).toBe(false);
    });

    it('should lock again if 5 new failures occur after the 15-minute reset', async () => {
      // After the window resets, 5 new failures within the new window trigger lockout
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-timeout');
      expect(locked).toBe(true);
    });
  });

  describe('Session expiry after 30 days (Req 1.6)', () => {
    it('should create a token that expires in exactly 30 days', () => {
      const token = createToken('user-expiry');
      const decoded = jwt.decode(token) as { userId: string; iat: number; exp: number };

      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
      expect(decoded.exp - decoded.iat).toBe(thirtyDaysInSeconds);
    });

    it('should reject a token that has expired (simulating 30+ days passed)', () => {
      const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
      // Create a token that expired 1 second ago
      const token = jwt.sign({ userId: 'user-expired' }, secret, { expiresIn: '-1s' });

      const result = verifyToken(token);
      expect(result).toBeNull();
    });

    it('should accept a token that has not yet expired', () => {
      const token = createToken('user-valid');
      const result = verifyToken(token);
      expect(result).toEqual({ userId: 'user-valid' });
    });

    it('should reject a token created exactly at the 30-day boundary (expired)', () => {
      const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
      // Simulate a token issued 30 days + 1 second ago
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60) - 1;
      const token = jwt.sign(
        { userId: 'user-boundary-expired', iat: thirtyDaysAgo },
        secret,
        { expiresIn: '30d' }
      );

      const result = verifyToken(token);
      expect(result).toBeNull();
    });
  });

  describe('Valid login returns token and user (Req 1.1)', () => {
    const mockUser = {
      id: 'user-uuid-login',
      username: 'validuser',
      password_hash: '',
      created_at: new Date('2024-06-15T10:00:00Z'),
    };

    beforeEach(async () => {
      mockUser.password_hash = await bcrypt.hash('securepassword', 4);
    });

    it('should return a valid JWT token on successful login', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - not locked
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // recordLoginAttempt
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await authenticate('validuser', 'securepassword');

      expect('token' in result).toBe(true);
      if ('token' in result) {
        // Verify the token is a valid JWT with 3 parts
        expect(result.token.split('.')).toHaveLength(3);

        // Verify the token can be decoded and contains the correct userId
        const decoded = jwt.decode(result.token) as { userId: string };
        expect(decoded.userId).toBe('user-uuid-login');
      }
    });

    it('should return the correct user object on successful login', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - not locked
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // recordLoginAttempt
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await authenticate('validuser', 'securepassword');

      expect('user' in result).toBe(true);
      if ('user' in result) {
        expect(result.user.id).toBe('user-uuid-login');
        expect(result.user.username).toBe('validuser');
        expect(result.user.createdAt).toEqual(new Date('2024-06-15T10:00:00Z'));
      }
    });

    it('should return both token and user together on successful login', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - not locked
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // recordLoginAttempt
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await authenticate('validuser', 'securepassword');

      // Both properties must exist
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result).not.toHaveProperty('error');
    });

    it('should return a token that verifies successfully', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - not locked
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // recordLoginAttempt
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await authenticate('validuser', 'securepassword');

      if ('token' in result) {
        const verified = verifyToken(result.token);
        expect(verified).not.toBeNull();
        expect(verified!.userId).toBe('user-uuid-login');
      }
    });
  });
});
