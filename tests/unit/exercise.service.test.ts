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
  updateExerciseName,
  removeExerciseFromSplit,
  ExerciseValidationError,
  ExerciseDuplicateError,
  ExerciseNotFoundError,
} from '@/services/exercise.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('ExerciseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createExercise', () => {
    it('should create an exercise with trimmed name and associate with split', async () => {
      // Duplicate check - no duplicates
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert exercise
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ex-1',
          user_id: 'user-1',
          name: 'Bench Press',
          weight_increment: '1.0',
          created_at: '2024-01-01T00:00:00Z',
        }],
      });
      // Insert split association
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await createExercise('user-1', '  Bench Press  ', 'UPPER');

      expect(result.name).toBe('Bench Press');
      expect(result.splits).toEqual(['UPPER']);
      expect(result.userId).toBe('user-1');
    });

    it('should reject empty name after trimming', async () => {
      await expect(createExercise('user-1', '   ', 'UPPER'))
        .rejects.toThrow(ExerciseValidationError);
    });

    it('should reject name exceeding 50 characters', async () => {
      const longName = 'A'.repeat(51);
      await expect(createExercise('user-1', longName, 'UPPER'))
        .rejects.toThrow(ExerciseValidationError);
    });

    it('should accept name at exactly 50 characters', async () => {
      const name50 = 'A'.repeat(50);
      // Duplicate check
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert exercise
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ex-2',
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
    });

    it('should reject case-insensitive duplicate within same split', async () => {
      // Duplicate check - found a match
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ex-existing' }] });

      await expect(createExercise('user-1', 'bench press', 'UPPER'))
        .rejects.toThrow(ExerciseDuplicateError);
    });

    it('should allow same name in different splits', async () => {
      // Duplicate check for LOWER - no duplicates
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert exercise
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ex-3',
          user_id: 'user-1',
          name: 'Deadlift',
          weight_increment: '1.0',
          created_at: '2024-01-01T00:00:00Z',
        }],
      });
      // Insert split association
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await createExercise('user-1', 'Deadlift', 'LOWER');
      expect(result.name).toBe('Deadlift');
      expect(result.splits).toEqual(['LOWER']);
    });
  });

  describe('getExercisesBySplit', () => {
    it('should return exercises ordered by added_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'ex-2',
            user_id: 'user-1',
            name: 'Overhead Press',
            weight_increment: '1.0',
            splits: ['UPPER'],
            created_at: '2024-01-02T00:00:00Z',
          },
          {
            id: 'ex-1',
            user_id: 'user-1',
            name: 'Bench Press',
            weight_increment: '2.5',
            splits: ['UPPER', 'ARMS'],
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const result = await getExercisesBySplit('user-1', 'UPPER');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Overhead Press');
      expect(result[1].name).toBe('Bench Press');
      expect(result[1].splits).toEqual(['UPPER', 'ARMS']);
    });

    it('should return empty array when no exercises in split', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getExercisesBySplit('user-1', 'ARMS');
      expect(result).toEqual([]);
    });

    it('should include user_id in query for data isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getExercisesBySplit('user-1', 'UPPER');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.user_id = $1'),
        ['user-1', 'UPPER']
      );
    });
  });

  describe('updateExerciseName', () => {
    it('should update exercise name with trimmed value', async () => {
      // Verify exercise exists
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ex-1',
          user_id: 'user-1',
          name: 'Old Name',
          weight_increment: '1.0',
          created_at: '2024-01-01T00:00:00Z',
        }],
      });
      // Get splits
      mockQuery.mockResolvedValueOnce({
        rows: [{ split: 'UPPER' }],
      });
      // Duplicate check
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Update
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ex-1',
          user_id: 'user-1',
          name: 'New Name',
          weight_increment: '1.0',
          created_at: '2024-01-01T00:00:00Z',
        }],
      });

      const result = await updateExerciseName('user-1', 'ex-1', '  New Name  ');
      expect(result.name).toBe('New Name');
    });

    it('should reject if exercise not found or belongs to another user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(updateExerciseName('user-1', 'ex-nonexistent', 'Name'))
        .rejects.toThrow(ExerciseNotFoundError);
    });

    it('should reject case-insensitive duplicate name in same splits', async () => {
      // Verify exercise exists
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'ex-1',
          user_id: 'user-1',
          name: 'Old Name',
          weight_increment: '1.0',
          created_at: '2024-01-01T00:00:00Z',
        }],
      });
      // Get splits
      mockQuery.mockResolvedValueOnce({
        rows: [{ split: 'UPPER' }],
      });
      // Duplicate check - found conflict
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ex-other' }] });

      await expect(updateExerciseName('user-1', 'ex-1', 'Existing Name'))
        .rejects.toThrow(ExerciseDuplicateError);
    });

    it('should reject empty name', async () => {
      await expect(updateExerciseName('user-1', 'ex-1', ''))
        .rejects.toThrow(ExerciseValidationError);
    });

    it('should reject name exceeding 50 characters', async () => {
      const longName = 'B'.repeat(51);
      await expect(updateExerciseName('user-1', 'ex-1', longName))
        .rejects.toThrow(ExerciseValidationError);
    });
  });

  describe('removeExerciseFromSplit', () => {
    it('should remove exercise-split association', async () => {
      // Verify exercise belongs to user
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ex-1' }] });
      // Delete association
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await expect(removeExerciseFromSplit('user-1', 'ex-1', 'UPPER'))
        .resolves.toBeUndefined();
    });

    it('should throw if exercise not found or belongs to another user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(removeExerciseFromSplit('user-1', 'ex-nonexistent', 'UPPER'))
        .rejects.toThrow(ExerciseNotFoundError);
    });

    it('should throw if exercise is not associated with the split', async () => {
      // Verify exercise belongs to user
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ex-1' }] });
      // Delete association - no rows affected
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await expect(removeExerciseFromSplit('user-1', 'ex-1', 'ARMS'))
        .rejects.toThrow(ExerciseNotFoundError);
    });

    it('should scope query to user_id for data isolation', async () => {
      // Verify exercise belongs to user
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ex-1' }] });
      // Delete association
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await removeExerciseFromSplit('user-1', 'ex-1', 'UPPER');

      // First call should check user_id
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        expect.stringContaining('user_id = $2'),
        ['ex-1', 'user-1']
      );
    });
  });
});
