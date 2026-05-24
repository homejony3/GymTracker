import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import { getWeightSuggestion } from '@/services/suggestion.service';

const mockQuery = vi.mocked(pool.query);

/**
 * Arbitrary for a valid weight increment (0.5–5.0 in 0.5 steps).
 */
const weightIncrementArb = fc.integer({ min: 1, max: 10 }).map(n => n * 0.5);

/**
 * Arbitrary for a valid weight in kg (0.5–500.0 in 0.5 steps, excluding 0 for meaningful tests).
 */
const weightKgArb = fc.integer({ min: 1, max: 1000 }).map(n => n * 0.5);

/**
 * Arbitrary for a valid rep count (1–999).
 */
const repsArb = fc.integer({ min: 1, max: 999 });

/**
 * Sets up the mock to respond to the 4 sequential queries made by getWeightSuggestion.
 * Uses SQL content detection and params to distinguish queries.
 *
 * The service queries in order:
 * 1. SELECT weight_increment FROM exercises WHERE id=$1 AND user_id=$2
 * 2. SELECT DISTINCT s.id... FROM sessions s INNER JOIN workout_sets ws...
 * 3. SELECT set_number, weight_kg, reps FROM workout_sets WHERE session_id=$1 AND exercise_id=$2 (most recent)
 * 4. SELECT set_number, weight_kg, reps FROM workout_sets WHERE session_id=$1 AND exercise_id=$2 (previous)
 *
 * We use the session_id param ($1) to distinguish queries 3 and 4.
 */
function mockSuggestionQueries(opts: {
  incrementKg: number;
  mostRecentSessionId: string;
  previousSessionId: string;
  mostRecentSets: { set_number: number; weight_kg: string; reps: number }[];
  previousSets: { set_number: number; weight_kg: string; reps: number }[];
}) {
  mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
    const query = typeof sql === 'string' ? sql : '';

    if (query.includes('weight_increment') && query.includes('exercises')) {
      // Query 1: Get exercise weight increment
      return {
        rows: [{ weight_increment: opts.incrementKg.toString() }],
      } as any;
    } else if (query.includes('SELECT DISTINCT') && query.includes('sessions')) {
      // Query 2: Get 2 most recent sessions
      return {
        rows: [
          { id: opts.mostRecentSessionId, session_date: '2024-01-15', created_at: '2024-01-15T10:00:00Z' },
          { id: opts.previousSessionId, session_date: '2024-01-10', created_at: '2024-01-10T10:00:00Z' },
        ],
      } as any;
    } else if (query.includes('workout_sets') && query.includes('session_id')) {
      // Queries 3 & 4: Distinguish by session_id param
      const sessionIdParam = params?.[0];
      if (sessionIdParam === opts.mostRecentSessionId) {
        return { rows: opts.mostRecentSets } as any;
      } else {
        return { rows: opts.previousSets } as any;
      }
    }

    return { rows: [] } as any;
  });
}

describe('Feature: gym-tracker, Property 14: Progressive overload — increase suggestion', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any exercise where the most recent session log shows the user completed
   * all sets with the same or greater number of reps per set compared to the
   * session before it, the weight suggestion SHALL equal the most recent weight
   * plus the configured increment for that exercise.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should suggest increase when most recent session has >= sets AND >= reps in every set position', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.uuid(), // exerciseId
        weightIncrementArb, // configured increment
        weightKgArb, // weight used in all sets (uniform)
        // Previous session reps per set (1–8 sets)
        fc.array(repsArb, { minLength: 1, maxLength: 8 }),
        // Bonus reps to add to each set in most recent (>= 0 means same or more)
        fc.array(fc.nat({ max: 50 }), { minLength: 8, maxLength: 8 }),
        // Extra sets to add in most recent session (>= 0 means same or more total sets)
        fc.nat({ max: 4 }),
        async (userId, exerciseId, incrementKg, weightKg, previousReps, bonusReps, extraSetCount) => {
          // Build most recent reps: each set has >= reps compared to previous
          const mostRecentReps = previousReps.map((prevRep, i) => {
            const bonus = bonusReps[i];
            return Math.min(prevRep + bonus, 999); // cap at max valid reps
          });

          // Add extra sets (most recent has >= total sets)
          for (let i = 0; i < extraSetCount; i++) {
            mostRecentReps.push(Math.min(1 + bonusReps[i], 999));
          }

          const mostRecentSessionId = 'session-recent';
          const previousSessionId = 'session-previous';

          const mostRecentSetsData = mostRecentReps.map((reps, i) => ({
            set_number: i + 1,
            weight_kg: weightKg.toFixed(1),
            reps,
          }));

          const previousSetsData = previousReps.map((reps, i) => ({
            set_number: i + 1,
            weight_kg: weightKg.toFixed(1),
            reps,
          }));

          mockSuggestionQueries({
            incrementKg,
            mostRecentSessionId,
            previousSessionId,
            mostRecentSets: mostRecentSetsData,
            previousSets: previousSetsData,
          });

          const result = await getWeightSuggestion(userId, exerciseId);

          expect(result.reasoning).toBe('increase');
          expect(result.suggestedWeightKg).toBe(weightKg + incrementKg);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 15: Progressive overload — maintain suggestion', () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any exercise where the most recent session log shows fewer sets or
   * fewer reps in any set compared to the session before it, the weight
   * suggestion SHALL equal the most recent session's weight (no increase).
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should suggest maintain when most recent session has fewer total sets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.uuid(), // exerciseId
        weightIncrementArb, // configured increment
        weightKgArb, // weight used
        // Previous session has 2–10 sets
        fc.array(repsArb, { minLength: 2, maxLength: 10 }),
        // How many sets to remove (at least 1)
        fc.integer({ min: 1, max: 9 }),
        async (userId, exerciseId, incrementKg, weightKg, previousReps, removeCount) => {
          // Ensure we actually remove at least 1 set but keep at least 1
          const actualRemove = Math.min(removeCount, previousReps.length - 1);
          if (actualRemove < 1) return; // skip if we can't remove any

          // Most recent has strictly fewer sets (reps values don't matter for this property)
          const mostRecentReps = previousReps.slice(0, previousReps.length - actualRemove);

          const mostRecentSessionId = 'session-recent';
          const previousSessionId = 'session-previous';

          const mostRecentSetsData = mostRecentReps.map((reps, i) => ({
            set_number: i + 1,
            weight_kg: weightKg.toFixed(1),
            reps,
          }));

          const previousSetsData = previousReps.map((reps, i) => ({
            set_number: i + 1,
            weight_kg: weightKg.toFixed(1),
            reps,
          }));

          mockSuggestionQueries({
            incrementKg,
            mostRecentSessionId,
            previousSessionId,
            mostRecentSets: mostRecentSetsData,
            previousSets: previousSetsData,
          });

          const result = await getWeightSuggestion(userId, exerciseId);

          expect(result.reasoning).toBe('maintain');
          expect(result.suggestedWeightKg).toBe(weightKg);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should suggest maintain when most recent session has fewer reps in at least one set position', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // userId
        fc.uuid(), // exerciseId
        weightIncrementArb, // configured increment
        weightKgArb, // weight used
        // Previous session sets with reps >= 2 (so we can regress by at least 1)
        fc.array(fc.integer({ min: 2, max: 999 }), { minLength: 1, maxLength: 8 }),
        // Which set index will regress
        fc.nat(),
        // How much to reduce reps by (at least 1)
        fc.integer({ min: 1, max: 50 }),
        async (userId, exerciseId, incrementKg, weightKg, previousReps, regressIndexRaw, regressAmount) => {
          const regressIndex = regressIndexRaw % previousReps.length;

          // Most recent has same number of sets, but one set has strictly fewer reps
          const mostRecentReps = previousReps.map((prevRep, i) => {
            if (i === regressIndex) {
              // Regress: ensure at least 1 rep and strictly less than previous
              return Math.max(1, prevRep - regressAmount);
            }
            // Other sets match previous
            return prevRep;
          });

          // Verify our generator actually produced a regression
          if (mostRecentReps[regressIndex] >= previousReps[regressIndex]) {
            return; // skip if regression didn't happen (e.g., prevRep was 2, regressAmount was 1, max(1, 2-1)=1 < 2 ✓, but if prevRep=1 it won't work)
          }

          const mostRecentSessionId = 'session-recent';
          const previousSessionId = 'session-previous';

          const mostRecentSetsData = mostRecentReps.map((reps, i) => ({
            set_number: i + 1,
            weight_kg: weightKg.toFixed(1),
            reps,
          }));

          const previousSetsData = previousReps.map((reps, i) => ({
            set_number: i + 1,
            weight_kg: weightKg.toFixed(1),
            reps,
          }));

          mockSuggestionQueries({
            incrementKg,
            mostRecentSessionId,
            previousSessionId,
            mostRecentSets: mostRecentSetsData,
            previousSets: previousSetsData,
          });

          const result = await getWeightSuggestion(userId, exerciseId);

          expect(result.reasoning).toBe('maintain');
          expect(result.suggestedWeightKg).toBe(weightKg);
        }
      ),
      { numRuns: 100 }
    );
  });
});
