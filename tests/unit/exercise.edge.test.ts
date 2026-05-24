import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import {
  createExercise,
  getExercisesBySplit,
  removeExerciseFromSplit,
  ExerciseValidationError,
} from '@/services/exercise.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('ExerciseService - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty split displays empty state (Req 2.6)', () => {
    it('should return an empty array when no exercises exist in a split', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getExercisesBySplit('user-1', 'ARMS');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('Removing exercise preserves historical session logs (Req 2.5, 3.3)', () => {
    it('should only delete from exercise_splits table and not touch workout_sets or sessions', async () => {
      // Verify exercise belongs to user
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ex-1' }] });
      // Delete association from exercise_splits
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await removeExerciseFromSplit('user-1', 'ex-1', 'UPPER');

      // Verify exactly 2 queries were made
      expect(mockQuery).toHaveBeenCalledTimes(2);

      // First query: ownership check on exercises table
      const firstCall = mockQuery.mock.calls[0];
      expect(firstCall[0]).toContain('exercises');
      expect(firstCall[0]).toContain('user_id');

      // Second query: delete from exercise_splits only
      const secondCall = mockQuery.mock.calls[1];
      expect(secondCall[0]).toContain('exercise_splits');
      expect(secondCall[0]).toContain('DELETE');

      // Verify no queries reference workout_sets or sessions tables
      for (const call of mockQuery.mock.calls) {
        const sql = call[0] as string;
        expect(sql).not.toContain('workout_sets');
        expect(sql).not.toContain('sessions');
      }
    });
  });

  describe('Exercise name with only whitespace is rejected (Req 3.6)', () => {
    it('should reject a name consisting of only spaces', async () => {
      await expect(createExercise('user-1', '   ', 'UPPER'))
        .rejects.toThrow(ExerciseValidationError);
    });

    it('should reject a name consisting of tabs and spaces', async () => {
      await expect(createExercise('user-1', ' \t \t ', 'LOWER'))
        .rejects.toThrow(ExerciseValidationError);
    });
  });

  describe('Exercise name at exactly 50 characters is accepted (Req 3.1)', () => {
    it('should accept a name with exactly 50 characters', async () => {
      const name50 = 'A'.repeat(50);

      // Duplicate check - no duplicates
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert exercise
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ex-50',
          user_id: 'user-1',
          name: name50,
          weight_increment: '1.0',
          created_at: '2024-01-01T00:00:00Z',
        }],
      });
      // Insert split association
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await createExercise('user-1', name50, 'UPPER');

      expect(result.name).toBe(name50);
      expect(result.name).toHaveLength(50);
    });

    it('should reject a name with 51 characters', async () => {
      const name51 = 'B'.repeat(51);

      await expect(createExercise('user-1', name51, 'UPPER'))
        .rejects.toThrow(ExerciseValidationError);
    });
  });
});
