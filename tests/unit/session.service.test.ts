import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import {
  createSession,
  completeSession,
  getSessionHistory,
  getSessionDetail,
  SessionNotFoundError,
  SessionValidationError,
} from '@/services/session.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('SessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session with current date and specified split', async () => {
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

      const result = await createSession('user-1', 'UPPER');

      expect(result.id).toBe('session-1');
      expect(result.userId).toBe('user-1');
      expect(result.split).toBe('UPPER');
      expect(result.completed).toBe(false);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        ['user-1', 'UPPER']
      );
    });

    it('should use CURRENT_DATE for session_date', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'session-2',
          user_id: 'user-1',
          split: 'LOWER',
          session_date: '2024-06-15',
          completed: false,
          created_at: '2024-06-15T10:00:00Z',
        }],
      });

      await createSession('user-1', 'LOWER');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CURRENT_DATE'),
        expect.any(Array)
      );
    });

    it('should associate session with the authenticated user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'session-3',
          user_id: 'user-2',
          split: 'ARMS',
          session_date: '2024-06-15',
          completed: false,
          created_at: '2024-06-15T10:00:00Z',
        }],
      });

      const result = await createSession('user-2', 'ARMS');

      expect(result.userId).toBe('user-2');
      expect(result.split).toBe('ARMS');
    });
  });

  describe('completeSession', () => {
    it('should complete a session that has at least 1 set', async () => {
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
      // Set count check - has sets
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '3' }],
      });
      // Update session
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          user_id: 'user-1',
          split: 'UPPER',
          session_date: '2024-06-15',
          completed: true,
          created_at: '2024-06-15T10:00:00Z',
        }],
      });

      const result = await completeSession('user-1', 'session-1');

      expect(result.completed).toBe(true);
      expect(result.id).toBe('session-1');
    });

    it('should throw SessionNotFoundError if session does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(completeSession('user-1', 'nonexistent'))
        .rejects.toThrow(SessionNotFoundError);
    });

    it('should throw SessionNotFoundError if session belongs to another user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(completeSession('user-1', 'session-of-user-2'))
        .rejects.toThrow(SessionNotFoundError);
    });

    it('should throw SessionValidationError if no sets exist', async () => {
      // Session exists
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
      // Set count check - no sets
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });

      await expect(completeSession('user-1', 'session-1'))
        .rejects.toThrow(SessionValidationError);
    });

    it('should scope session lookup to user_id for data isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(completeSession('user-1', 'session-1'))
        .rejects.toThrow(SessionNotFoundError);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $2'),
        ['session-1', 'user-1']
      );
    });
  });

  describe('getSessionHistory', () => {
    it('should return paginated sessions ordered by session_date DESC', async () => {
      // Count query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '75' }],
      });
      // Data query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'session-2',
            user_id: 'user-1',
            split: 'UPPER',
            session_date: '2024-06-15',
            completed: true,
            created_at: '2024-06-15T10:00:00Z',
          },
          {
            id: 'session-1',
            user_id: 'user-1',
            split: 'LOWER',
            session_date: '2024-06-14',
            completed: true,
            created_at: '2024-06-14T10:00:00Z',
          },
        ],
      });

      const result = await getSessionHistory('user-1', 1);

      expect(result.total).toBe(75);
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].id).toBe('session-2');
      expect(result.sessions[1].id).toBe('session-1');
    });

    it('should apply split filter when provided', async () => {
      // Count query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '10' }],
      });
      // Data query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          user_id: 'user-1',
          split: 'UPPER',
          session_date: '2024-06-15',
          completed: true,
          created_at: '2024-06-15T10:00:00Z',
        }],
      });

      const result = await getSessionHistory('user-1', 1, 'UPPER');

      expect(result.total).toBe(10);
      expect(result.sessions[0].split).toBe('UPPER');
      // Verify split filter is in the query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('split = $2'),
        ['user-1', 'UPPER']
      );
    });

    it('should calculate correct offset for page 2', async () => {
      // Count query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '75' }],
      });
      // Data query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getSessionHistory('user-1', 2);

      // Without split filter: params are [userId, PAGE_SIZE, offset]
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        expect.stringContaining('OFFSET $3'),
        ['user-1', 50, 50]
      );
    });

    it('should return empty sessions array when no sessions exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getSessionHistory('user-1', 1);

      expect(result.total).toBe(0);
      expect(result.sessions).toEqual([]);
    });

    it('should scope queries to user_id for data isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getSessionHistory('user-1', 1);

      // Both count and data queries should include user_id
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        expect.stringContaining('user_id = $1'),
        ['user-1']
      );
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        expect.stringContaining('user_id = $1'),
        expect.arrayContaining(['user-1'])
      );
    });
  });

  describe('getSessionDetail', () => {
    it('should return session with all workout sets', async () => {
      // Session query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          user_id: 'user-1',
          split: 'UPPER',
          session_date: '2024-06-15',
          completed: true,
          created_at: '2024-06-15T10:00:00Z',
        }],
      });
      // Sets query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'set-1',
            session_id: 'session-1',
            exercise_id: 'ex-1',
            set_number: 1,
            weight_kg: '80.0',
            reps: 8,
            created_at: '2024-06-15T10:05:00Z',
          },
          {
            id: 'set-2',
            session_id: 'session-1',
            exercise_id: 'ex-1',
            set_number: 2,
            weight_kg: '80.0',
            reps: 7,
            created_at: '2024-06-15T10:08:00Z',
          },
        ],
      });

      const result = await getSessionDetail('user-1', 'session-1');

      expect(result.id).toBe('session-1');
      expect(result.split).toBe('UPPER');
      expect(result.sets).toHaveLength(2);
      expect(result.sets[0].weightKg).toBe(80.0);
      expect(result.sets[0].reps).toBe(8);
      expect(result.sets[1].setNumber).toBe(2);
    });

    it('should throw SessionNotFoundError if session does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(getSessionDetail('user-1', 'nonexistent'))
        .rejects.toThrow(SessionNotFoundError);
    });

    it('should throw SessionNotFoundError if session belongs to another user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(getSessionDetail('user-1', 'session-of-user-2'))
        .rejects.toThrow(SessionNotFoundError);
    });

    it('should return empty sets array for session with no sets', async () => {
      // Session query
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
      // Sets query - no sets
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getSessionDetail('user-1', 'session-1');

      expect(result.sets).toEqual([]);
      expect(result.completed).toBe(false);
    });

    it('should scope session lookup to user_id for data isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(getSessionDetail('user-1', 'session-1'))
        .rejects.toThrow(SessionNotFoundError);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $2'),
        ['session-1', 'user-1']
      );
    });
  });
});
