import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import { getWeightSuggestion } from '@/services/suggestion.service';

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe('Suggestion Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('No prior session returns null suggestion (Req 6.6)', () => {
    it('should return suggestedWeightKg: null when no completed sessions exist', async () => {
      // Query 1: exercise weight_increment lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '1.0' }],
      });
      // Query 2: find recent completed sessions — none found
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      expect(result.suggestedWeightKg).toBeNull();
      expect(result.reasoning).toBe('no_history');
      expect(result.previousWeightKg).toBeNull();
    });

    it('should return the full no_history shape', async () => {
      // Query 1: exercise weight_increment lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '2.5' }],
      });
      // Query 2: find recent completed sessions — none found
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      expect(result).toEqual({
        exerciseId: 'exercise-1',
        suggestedWeightKg: null,
        reasoning: 'no_history',
        previousWeightKg: null,
        incrementKg: 2.5,
      });
    });
  });

  describe('Custom weight increment per exercise (Req 6.2, 6.3)', () => {
    it('should use 2.5 kg increment when exercise is configured with 2.5', async () => {
      // Query 1: exercise has weight_increment of 2.5
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '2.5' }],
      });
      // Query 2: two completed sessions found
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'session-2', session_date: '2024-06-20', created_at: '2024-06-20T10:00:00Z' },
          { id: 'session-1', session_date: '2024-06-15', created_at: '2024-06-15T10:00:00Z' },
        ],
      });
      // Query 3: most recent session sets (session-2)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '60.0', reps: 10 },
          { set_number: 2, weight_kg: '60.0', reps: 10 },
          { set_number: 3, weight_kg: '60.0', reps: 10 },
        ],
      });
      // Query 4: previous session sets (session-1)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '60.0', reps: 8 },
          { set_number: 2, weight_kg: '60.0', reps: 8 },
          { set_number: 3, weight_kg: '60.0', reps: 8 },
        ],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      expect(result.reasoning).toBe('increase');
      expect(result.suggestedWeightKg).toBe(62.5); // 60.0 + 2.5
      expect(result.incrementKg).toBe(2.5);
    });

    it('should use 0.5 kg increment when exercise is configured with 0.5', async () => {
      // Query 1: exercise has weight_increment of 0.5
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '0.5' }],
      });
      // Query 2: two completed sessions found
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'session-2', session_date: '2024-06-20', created_at: '2024-06-20T10:00:00Z' },
          { id: 'session-1', session_date: '2024-06-15', created_at: '2024-06-15T10:00:00Z' },
        ],
      });
      // Query 3: most recent session sets
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '40.0', reps: 12 },
        ],
      });
      // Query 4: previous session sets
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '40.0', reps: 10 },
        ],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      expect(result.reasoning).toBe('increase');
      expect(result.suggestedWeightKg).toBe(40.5); // 40.0 + 0.5
      expect(result.incrementKg).toBe(0.5);
    });

    it('should use 5.0 kg increment when exercise is configured with 5.0', async () => {
      // Query 1: exercise has weight_increment of 5.0
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '5.0' }],
      });
      // Query 2: two completed sessions found
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'session-2', session_date: '2024-06-20', created_at: '2024-06-20T10:00:00Z' },
          { id: 'session-1', session_date: '2024-06-15', created_at: '2024-06-15T10:00:00Z' },
        ],
      });
      // Query 3: most recent session sets
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '100.0', reps: 5 },
          { set_number: 2, weight_kg: '100.0', reps: 5 },
        ],
      });
      // Query 4: previous session sets
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '100.0', reps: 5 },
          { set_number: 2, weight_kg: '100.0', reps: 5 },
        ],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      expect(result.reasoning).toBe('increase');
      expect(result.suggestedWeightKg).toBe(105.0); // 100.0 + 5.0
      expect(result.incrementKg).toBe(5.0);
    });
  });

  describe('Suggestion with only one prior session (Req 6.6)', () => {
    it('should return reasoning=maintain when only one completed session exists', async () => {
      // Query 1: exercise weight_increment lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '1.0' }],
      });
      // Query 2: only one completed session found
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'session-1', session_date: '2024-06-15', created_at: '2024-06-15T10:00:00Z' },
        ],
      });
      // Query 3: sets for the single session
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '50.0', reps: 10 },
          { set_number: 2, weight_kg: '50.0', reps: 8 },
        ],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      expect(result.reasoning).toBe('maintain');
      expect(result.suggestedWeightKg).toBe(50.0);
      expect(result.previousWeightKg).toBe(50.0);
    });

    it('should use the max weight from the single session sets', async () => {
      // Query 1: exercise weight_increment lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '2.0' }],
      });
      // Query 2: only one completed session found
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'session-1', session_date: '2024-06-15', created_at: '2024-06-15T10:00:00Z' },
        ],
      });
      // Query 3: sets with varying weights
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '60.0', reps: 10 },
          { set_number: 2, weight_kg: '65.0', reps: 8 },
          { set_number: 3, weight_kg: '70.0', reps: 6 },
        ],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      expect(result.reasoning).toBe('maintain');
      expect(result.suggestedWeightKg).toBe(70.0); // max weight from sets
      expect(result.previousWeightKg).toBe(70.0);
      expect(result.incrementKg).toBe(2.0);
    });

    it('should not attempt to compare with a non-existent previous session', async () => {
      // Query 1: exercise weight_increment lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ weight_increment: '1.0' }],
      });
      // Query 2: only one completed session found
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'session-1', session_date: '2024-06-15', created_at: '2024-06-15T10:00:00Z' },
        ],
      });
      // Query 3: sets for the single session
      mockQuery.mockResolvedValueOnce({
        rows: [
          { set_number: 1, weight_kg: '80.0', reps: 5 },
        ],
      });

      const result = await getWeightSuggestion('user-1', 'exercise-1');

      // Should only have made 3 queries (no 4th query for previous session sets)
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(result.reasoning).toBe('maintain');
    });
  });
});
