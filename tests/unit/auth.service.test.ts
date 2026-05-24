import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  recordLoginAttempt,
  isAccountLocked,
  authenticate,
} from '@/services/auth.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should return a bcrypt hash', async () => {
      const hash = await hashPassword('mypassword');
      expect(hash).toMatch(/^\$2[aby]?\$/);
    });

    it('should produce different hashes for the same password (salt)', async () => {
      const hash1 = await hashPassword('same');
      const hash2 = await hashPassword('same');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for matching password and hash', async () => {
      const hash = await bcrypt.hash('correct', 4); // low rounds for speed
      const result = await verifyPassword('correct', hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const hash = await bcrypt.hash('correct', 4);
      const result = await verifyPassword('wrong', hash);
      expect(result).toBe(false);
    });
  });

  describe('createToken', () => {
    it('should return a valid JWT string', () => {
      const token = createToken('user-123');
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should embed userId in the payload', () => {
      const token = createToken('user-456');
      const decoded = jwt.decode(token) as { userId: string; exp: number };
      expect(decoded.userId).toBe('user-456');
    });

    it('should set expiry to approximately 30 days', () => {
      const token = createToken('user-789');
      const decoded = jwt.decode(token) as { userId: string; iat: number; exp: number };
      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
      const diff = decoded.exp - decoded.iat;
      expect(diff).toBe(thirtyDaysInSeconds);
    });
  });

  describe('verifyToken', () => {
    it('should return userId for a valid token', () => {
      const token = createToken('user-abc');
      const result = verifyToken(token);
      expect(result).toEqual({ userId: 'user-abc' });
    });

    it('should return null for an invalid token', () => {
      const result = verifyToken('invalid.token.here');
      expect(result).toBeNull();
    });

    it('should return null for an expired token', () => {
      const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
      const token = jwt.sign({ userId: 'user-expired' }, secret, { expiresIn: '-1s' });
      const result = verifyToken(token);
      expect(result).toBeNull();
    });

    it('should return null for a token signed with wrong secret', () => {
      const token = jwt.sign({ userId: 'user-wrong' }, 'wrong-secret', { expiresIn: '30d' });
      const result = verifyToken(token);
      expect(result).toBeNull();
    });
  });

  describe('recordLoginAttempt', () => {
    it('should insert a login attempt record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await recordLoginAttempt('user-123', true);

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO login_attempts (user_id, success, attempted_at) VALUES ($1, $2, NOW())',
        ['user-123', true]
      );
    });

    it('should record failed attempts', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await recordLoginAttempt('user-123', false);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['user-123', false]
      );
    });
  });

  describe('isAccountLocked', () => {
    it('should return false when fewer than 5 attempts exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-123');
      expect(locked).toBe(false);
    });

    it('should return true when 5 consecutive failures exist within window', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-123');
      expect(locked).toBe(true);
    });

    it('should return false when a success exists among recent attempts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: true, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const locked = await isAccountLocked('user-123');
      expect(locked).toBe(false);
    });
  });

  describe('authenticate', () => {
    const mockUser = {
      id: 'user-uuid-1',
      username: 'testuser',
      password_hash: '', // will be set in beforeEach
      created_at: new Date('2024-01-01'),
    };

    beforeEach(async () => {
      mockUser.password_hash = await bcrypt.hash('correctpassword', 4);
    });

    it('should return same error for non-existent username (Req 1.2)', async () => {
      // User lookup returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await authenticate('nonexistent', 'anypassword');
      expect(result).toEqual({ error: 'Invalid credentials' });
    });

    it('should return same error for wrong password (Req 1.2)', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - not locked
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // recordLoginAttempt
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // isAccountLocked check after failure - not locked yet
      mockQuery.mockResolvedValueOnce({ rows: [{ success: false, attempted_at: new Date() }] });

      const result = await authenticate('testuser', 'wrongpassword');
      expect(result).toEqual({ error: 'Invalid credentials' });
    });

    it('should return token and user on valid credentials', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - not locked
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // recordLoginAttempt
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await authenticate('testuser', 'correctpassword');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      if ('user' in result) {
        expect(result.user.id).toBe('user-uuid-1');
        expect(result.user.username).toBe('testuser');
      }
    });

    it('should return locked error when account is locked', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - locked (5 failures)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const result = await authenticate('testuser', 'correctpassword');
      expect(result).toEqual({ error: 'Account locked for 15 minutes', locked: true });
    });

    it('should return locked error when 5th failure triggers lockout', async () => {
      // User lookup
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });
      // isAccountLocked check - not locked yet (4 failures)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });
      // recordLoginAttempt (5th failure)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // isAccountLocked check after failure - now locked (5 failures)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
          { success: false, attempted_at: new Date() },
        ],
      });

      const result = await authenticate('testuser', 'wrongpassword');
      expect(result).toEqual({ error: 'Account locked for 15 minutes', locked: true });
    });
  });
});
