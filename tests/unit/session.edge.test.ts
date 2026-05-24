import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import {
  completeSession,
  getSessionHistory,
  SessionValidationError,
} from '@/services/session.service';
import {
  logSet,
  updateSet,
  deleteSet,
  SetValidationError,
} from '@/services/set.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('Session Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Session with 0 sets cannot be completed (Req 4.8)', () => {
    it('should throw SessionValidationError when set count is 0', async () => {
      // Session exists and belongs to user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          user_id: 'user-1',
          split: 'UPPER',
          session_date: '2024-06-15',
          completed: false,
          created_at: '2024-06-15T10:00:00Z',
        }],
      });
      // Set count check returns 0
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });

      await expect(completeSession('user-1', 'session-1'))
        .rejects.toThrow(SessionValidationError);
    });

    it('should include a message about needing at least one set', async () => {
      // Session exists and belongs to user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          user_id: 'user-1',
          split: 'LOWER',
          session_date: '2024-06-15',
          completed: false,
          created_at: '2024-06-15T10:00:00Z',
        }],
      });
      // Set count check returns 0
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });

      await expect(completeSession('user-1', 'session-1'))
        .rejects.toThrow(/at least one set/i);
    });
  });

  describe('Editing/deleting set in completed session is rejected (Req 4.5)', () => {
    it('should throw SetValidationError when updating a set in a completed session', async () => {
      // Set check - session is completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: true }],
      });

      await expect(updateSet('user-1', 'set-1', 60.0, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should throw SetValidationError when deleting a set from a completed session', async () => {
      // Set check - session is completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: true }],
      });

      await expect(deleteSet('user-1', 'set-1'))
        .rejects.toThrow(SetValidationError);
    });

    it('should include a message about completed session on edit attempt', async () => {
      // Set check - session is completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: true }],
      });

      await expect(updateSet('user-1', 'set-1', 60.0, 10))
        .rejects.toThrow(/completed session/i);
    });

    it('should include a message about completed session on delete attempt', async () => {
      // Set check - session is completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: true }],
      });

      await expect(deleteSet('user-1', 'set-1'))
        .rejects.toThrow(/completed session/i);
    });
  });

  describe('Max 50 sets per exercise per session (Req 4.3)', () => {
    it('should throw SetValidationError when count is already 50', async () => {
      // Session check - belongs to user, not completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets - already at max (50)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });

      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should include a message about maximum sets reached', async () => {
      // Session check - belongs to user, not completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets - already at max (50)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });

      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 10))
        .rejects.toThrow(/50/);
    });

    it('should allow logging set number 50 (count at 49)', async () => {
      // Session check - belongs to user, not completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets - 49 exist, one more is allowed
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '49' }] });
      // Insert set
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'set-50',
          session_id: 'session-1',
          exercise_id: 'ex-1',
          set_number: 50,
          weight_kg: '50.0',
          reps: 10,
          created_at: '2024-01-01T00:00:00Z',
        }],
      });

      const result = await logSet('user-1', 'session-1', 'ex-1', 50.0, 10);

      expect(result.setNumber).toBe(50);
    });
  });

  describe('No history returns empty list with message (Req 5.7)', () => {
    it('should return { sessions: [], total: 0 } when no sessions exist', async () => {
      // Count query returns 0
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Data query returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getSessionHistory('user-1', 1);

      expect(result.sessions).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty list when filtering by split with no matching sessions', async () => {
      // Count query returns 0
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Data query returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getSessionHistory('user-1', 1, 'ARMS');

      expect(result.sessions).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
