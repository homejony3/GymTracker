import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import { verifyToken, authenticate } from '@/services/auth.service';
import bcrypt from 'bcryptjs';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('Feature: gym-tracker, Property 2: Unauthenticated access rejection', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any API endpoint that requires authentication and any request without
   * a valid JWT token, the system SHALL reject the request and return an
   * unauthorized response.
   *
   * We test this at the service level by verifying that verifyToken() returns
   * null for any arbitrary string that is not a valid JWT signed with the
   * correct secret.
   */
  it('should reject any random string as an invalid JWT token', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (randomToken: string) => {
          const result = verifyToken(randomToken);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject tokens with random base64 segments', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.base64String({ minLength: 1, maxLength: 100 }),
          fc.base64String({ minLength: 1, maxLength: 100 }),
          fc.base64String({ minLength: 1, maxLength: 100 })
        ),
        ([header, payload, signature]) => {
          const fakeToken = `${header}.${payload}.${signature}`;
          const result = verifyToken(fakeToken);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject tokens signed with a random secret', () => {
    // Import jsonwebtoken to create tokens with wrong secrets
    const jwt = require('jsonwebtoken');

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.uuid(),
        (randomSecret: string, userId: string) => {
          // Ensure the random secret is different from the actual secret
          const actualSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
          if (randomSecret === actualSecret) return; // skip this case

          const token = jwt.sign({ userId }, randomSecret, { expiresIn: '30d' });
          const result = verifyToken(token);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 3: Authentication error uniformity', () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any login attempt with invalid credentials (wrong username, wrong
   * password, or both), the system SHALL return the same error message
   * regardless of which field was incorrect.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the same error message for wrong username vs wrong password', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (randomUsername: string, randomPassword: string, existingUsername: string) => {
          // Scenario 1: Non-existent username (user not found)
          mockQuery.mockResolvedValueOnce({ rows: [] });

          const resultWrongUsername = await authenticate(randomUsername, randomPassword);

          // Scenario 2: Existing user but wrong password
          const correctHash = await bcrypt.hash('correct-password-xyz', 4);
          // User lookup - user found
          mockQuery.mockResolvedValueOnce({
            rows: [{
              id: 'user-uuid-test',
              username: existingUsername,
              password_hash: correctHash,
              created_at: new Date(),
            }],
          });
          // isAccountLocked check - not locked
          mockQuery.mockResolvedValueOnce({ rows: [] });
          // recordLoginAttempt
          mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
          // isAccountLocked after failure - not locked
          mockQuery.mockResolvedValueOnce({
            rows: [{ success: false, attempted_at: new Date() }],
          });

          const resultWrongPassword = await authenticate(existingUsername, randomPassword);

          // Both should have an error field
          expect('error' in resultWrongUsername).toBe(true);
          expect('error' in resultWrongPassword).toBe(true);

          if ('error' in resultWrongUsername && 'error' in resultWrongPassword) {
            // The error messages must be identical (Req 1.2)
            expect(resultWrongUsername.error).toBe(resultWrongPassword.error);
            // And specifically should be the generic message
            expect(resultWrongUsername.error).toBe('Invalid credentials');
            expect(resultWrongPassword.error).toBe('Invalid credentials');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never reveal whether the username or password was incorrect', async () => {
    // Use alphanumeric strings to avoid false positives where the username
    // happens to be a substring of the generic error message (e.g. a space
    // character is contained in "Invalid credentials").
    const usernameArb = fc.stringMatching(/^[a-zA-Z0-9_]{1,50}$/).filter(
      (s) => !'Invalid credentials'.includes(s)
    );

    await fc.assert(
      fc.asyncProperty(
        usernameArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (username: string, password: string) => {
          // Non-existent user case
          mockQuery.mockResolvedValueOnce({ rows: [] });

          const result = await authenticate(username, password);

          expect('error' in result).toBe(true);
          if ('error' in result) {
            // Error message should NOT contain the username
            expect(result.error).not.toContain(username);
            // Error message should NOT contain hints about which field was wrong
            expect(result.error.toLowerCase()).not.toContain('username');
            expect(result.error.toLowerCase()).not.toContain('password');
            expect(result.error.toLowerCase()).not.toContain('not found');
            expect(result.error.toLowerCase()).not.toContain('does not exist');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
