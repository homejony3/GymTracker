import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import {
  logSet,
  updateSet,
  deleteSet,
  SetValidationError,
  SetNotFoundError,
} from '@/services/set.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('SetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logSet', () => {
    it('should log a set with valid weight and reps', async () => {
      // Session check - belongs to user, not completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // Insert set
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'set-1',
          session_id: 'session-1',
          exercise_id: 'ex-1',
          set_number: 3,
          weight_kg: '72.5',
          reps: 10,
          created_at: '2024-01-01T00:00:00Z',
        }],
      });

      const result = await logSet('user-1', 'session-1', 'ex-1', 72.5, 10);

      expect(result.id).toBe('set-1');
      expect(result.sessionId).toBe('session-1');
      expect(result.exerciseId).toBe('ex-1');
      expect(result.setNumber).toBe(3);
      expect(result.weightKg).toBe(72.5);
      expect(result.reps).toBe(10);
    });

    it('should auto-increment set_number based on existing count', async () => {
      // Session check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets - 5 already exist
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      // Insert set
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'set-6',
          session_id: 'session-1',
          exercise_id: 'ex-1',
          set_number: 6,
          weight_kg: '100.0',
          reps: 5,
          created_at: '2024-01-01T00:00:00Z',
        }],
      });

      const result = await logSet('user-1', 'session-1', 'ex-1', 100.0, 5);

      expect(result.setNumber).toBe(6);
      // Verify the INSERT used set_number = 6
      expect(mockQuery).toHaveBeenNthCalledWith(3,
        expect.stringContaining('INSERT INTO workout_sets'),
        ['session-1', 'ex-1', 6, 100.0, 5]
      );
    });

    it('should reject weight below minimum (0.0)', async () => {
      await expect(logSet('user-1', 'session-1', 'ex-1', -0.5, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject weight above maximum (500.0)', async () => {
      await expect(logSet('user-1', 'session-1', 'ex-1', 500.5, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject weight not in 0.5 increments', async () => {
      await expect(logSet('user-1', 'session-1', 'ex-1', 72.3, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should accept weight of 0.0', async () => {
      // Session check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Insert set
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'set-1',
          session_id: 'session-1',
          exercise_id: 'ex-1',
          set_number: 1,
          weight_kg: '0.0',
          reps: 1,
          created_at: '2024-01-01T00:00:00Z',
        }],
      });

      const result = await logSet('user-1', 'session-1', 'ex-1', 0.0, 1);
      expect(result.weightKg).toBe(0.0);
    });

    it('should accept weight of 500.0', async () => {
      // Session check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // Insert set
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'set-1',
          session_id: 'session-1',
          exercise_id: 'ex-1',
          set_number: 1,
          weight_kg: '500.0',
          reps: 1,
          created_at: '2024-01-01T00:00:00Z',
        }],
      });

      const result = await logSet('user-1', 'session-1', 'ex-1', 500.0, 1);
      expect(result.weightKg).toBe(500.0);
    });

    it('should reject reps below minimum (1)', async () => {
      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 0))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject reps above maximum (999)', async () => {
      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 1000))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject non-integer reps', async () => {
      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 5.5))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject if session not found', async () => {
      // Session check - not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 10))
        .rejects.toThrow(SetNotFoundError);
    });

    it('should reject if session is completed', async () => {
      // Session check - completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: true }],
      });

      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject if max sets (50) per exercise per session reached', async () => {
      // Session check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'session-1', completed: false }],
      });
      // Count existing sets - already at max
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '50' }] });

      await expect(logSet('user-1', 'session-1', 'ex-1', 50.0, 10))
        .rejects.toThrow(SetValidationError);
    });
  });

  describe('updateSet', () => {
    it('should update a set with valid weight and reps', async () => {
      // Set check - exists, session not completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: false }],
      });
      // Update set
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'set-1',
          session_id: 'session-1',
          exercise_id: 'ex-1',
          set_number: 1,
          weight_kg: '80.0',
          reps: 8,
          created_at: '2024-01-01T00:00:00Z',
        }],
      });

      const result = await updateSet('user-1', 'set-1', 80.0, 8);

      expect(result.weightKg).toBe(80.0);
      expect(result.reps).toBe(8);
    });

    it('should reject if set not found or belongs to another user', async () => {
      // Set check - not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(updateSet('user-1', 'set-nonexistent', 50.0, 10))
        .rejects.toThrow(SetNotFoundError);
    });

    it('should reject if session is completed', async () => {
      // Set check - session completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: true }],
      });

      await expect(updateSet('user-1', 'set-1', 50.0, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject invalid weight on update', async () => {
      await expect(updateSet('user-1', 'set-1', 72.3, 10))
        .rejects.toThrow(SetValidationError);
    });

    it('should reject invalid reps on update', async () => {
      await expect(updateSet('user-1', 'set-1', 50.0, 0))
        .rejects.toThrow(SetValidationError);
    });
  });

  describe('deleteSet', () => {
    it('should delete a set from an active session', async () => {
      // Set check - exists, session not completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: false }],
      });
      // Delete set
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await expect(deleteSet('user-1', 'set-1')).resolves.toBeUndefined();
    });

    it('should reject if set not found or belongs to another user', async () => {
      // Set check - not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(deleteSet('user-1', 'set-nonexistent'))
        .rejects.toThrow(SetNotFoundError);
    });

    it('should reject if session is completed', async () => {
      // Set check - session completed
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: true }],
      });

      await expect(deleteSet('user-1', 'set-1'))
        .rejects.toThrow(SetValidationError);
    });

    it('should scope query to user_id for data isolation', async () => {
      // Set check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'set-1', session_id: 'session-1', completed: false }],
      });
      // Delete
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await deleteSet('user-1', 'set-1');

      // First call should join sessions and check user_id
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        expect.stringContaining('s.user_id = $2'),
        ['set-1', 'user-1']
      );
    });
  });
});
