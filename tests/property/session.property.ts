import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import { logSet, SetValidationError } from '@/services/set.service';
import { getSessionDetail, getSessionHistory } from '@/services/session.service';
import { WEIGHT, REPS } from '@/lib/constants';
import type { WorkoutSplit } from '@/types';

const mockQuery = vi.mocked(pool.query);

const splitArb = fc.constantFrom<WorkoutSplit>('UPPER', 'LOWER', 'ARMS');

/**
 * Arbitrary for valid weight values: [0.0, 500.0] in 0.5 increments.
 */
const validWeightArb = fc.integer({ min: 0, max: 1000 }).map(n => n * 0.5);

/**
 * Arbitrary for valid reps: integer in [1, 999].
 */
const validRepsArb = fc.integer({ min: 1, max: 999 });

/**
 * Arbitrary for invalid weight values: outside [0.0, 500.0] or not a 0.5 step.
 */
const invalidWeightArb = fc.oneof(
  // Below minimum (negative values in 0.5 steps)
  fc.integer({ min: -2000, max: -1 }).map(n => n * 0.5),
  // Above maximum (values > 500.0 in 0.5 steps)
  fc.integer({ min: 1001, max: 4000 }).map(n => n * 0.5),
  // Not a 0.5 step within valid range (e.g., 0.1, 0.2, 0.3, 0.4, 0.6, etc.)
  fc.integer({ min: 1, max: 4999 })
    .filter(n => n % 5 !== 0)
    .map(n => n * 0.1)
);

/**
 * Arbitrary for invalid reps: outside [1, 999].
 */
const invalidRepsArb = fc.oneof(
  // Below minimum
  fc.integer({ min: -1000, max: 0 }),
  // Above maximum
  fc.integer({ min: 1000, max: 10000 })
);

describe('Feature: gym-tracker, Property 10: Workout set value validation', () => {
  /**
   * **Validates: Requirements 4.2, 4.7**
   *
   * For any numeric weight value and rep count, the system SHALL accept the set
   * if and only if weight is in [0.0, 500.0] in 0.5 kg increments AND reps is
   * an integer in [1, 999]. Values outside these ranges SHALL be rejected.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should accept valid weight and reps values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        validWeightArb,
        validRepsArb,
        async (userId, sessionId, exerciseId, weight, reps) => {
          /**
           * logSet makes 3 queries:
           * 1. "SELECT id, completed FROM sessions WHERE id = $1 AND user_id = $2"
           * 2. "SELECT COUNT(*) AS count FROM workout_sets WHERE session_id = $1 AND exercise_id = $2"
           * 3. "INSERT INTO workout_sets (...) VALUES ($1, $2, $3, $4, $5) RETURNING ..."
           *
           * Use SQL content detection (resilient to fast-check shrinking).
           * The mock uses ONLY the params passed to it, never closure variables,
           * to avoid race conditions during fast-check's shrinking process.
           */
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            const query = typeof sql === 'string' ? sql : '';
            if (query.includes('INSERT INTO workout_sets')) {
              return {
                rows: [{
                  id: 'set-generated',
                  session_id: params![0],
                  exercise_id: params![1],
                  set_number: params![2],
                  weight_kg: String(params![3]),
                  reps: params![4],
                  created_at: new Date().toISOString(),
                }],
              } as any;
            } else if (query.includes('COUNT')) {
              return { rows: [{ count: '0' }] } as any;
            } else if (query.includes('SELECT') && query.includes('sessions')) {
              // Return session with the id from params
              return { rows: [{ id: params![0], completed: false }] } as any;
            }
            return { rows: [], rowCount: 0 } as any;
          });

          const result = await logSet(userId, sessionId, exerciseId, weight, reps);

          // The key property: valid values are accepted without error
          expect(result).toBeDefined();
          expect(result.weightKg).toBe(weight);
          expect(result.reps).toBe(reps);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject invalid weight values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        invalidWeightArb,
        validRepsArb,
        async (userId, sessionId, exerciseId, weight, reps) => {
          // No mock needed - validation happens before any DB call
          await expect(logSet(userId, sessionId, exerciseId, weight, reps))
            .rejects.toThrow(SetValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject invalid reps values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        validWeightArb,
        invalidRepsArb,
        async (userId, sessionId, exerciseId, weight, reps) => {
          // No mock needed - validation happens before any DB call
          await expect(logSet(userId, sessionId, exerciseId, weight, reps))
            .rejects.toThrow(SetValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 11: Session completion round-trip', () => {
  /**
   * **Validates: Requirements 4.4, 5.2**
   *
   * For any completed session containing N sets, querying that session from
   * the history store SHALL return exactly those N sets with identical weight,
   * reps, and set number values.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return exactly N sets with identical values for a completed session', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        splitArb,
        fc.array(
          fc.record({
            id: fc.uuid(),
            exerciseId: fc.uuid(),
            setNumber: fc.integer({ min: 1, max: 50 }),
            weightKg: validWeightArb,
            reps: validRepsArb,
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (userId, sessionId, split, sets) => {
          // Sort sets by set_number ASC to match the DB ORDER BY clause
          const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);

          // Capture the sorted sets data as a stable reference for this iteration
          const mockSetRows = sortedSets.map(s => ({
            id: s.id,
            session_id: sessionId,
            exercise_id: s.exerciseId,
            set_number: s.setNumber,
            weight_kg: String(s.weightKg),
            reps: s.reps,
            created_at: '2024-01-15T00:00:00.000Z',
          }));

          const mockSessionRow = {
            id: sessionId,
            user_id: userId,
            split: split,
            session_date: '2024-01-15',
            completed: true,
            created_at: '2024-01-15T00:00:00.000Z',
          };

          /**
           * getSessionDetail makes two queries:
           * 1. "SELECT ... FROM sessions WHERE id = $1 AND user_id = $2"
           * 2. "SELECT ... FROM workout_sets WHERE session_id = $1 ORDER BY set_number ASC"
           *
           * Distinguish by checking for "workout_sets" in the query.
           */
          mockQuery.mockImplementation(async (sql: string) => {
            const query = typeof sql === 'string' ? sql : '';
            if (query.includes('workout_sets')) {
              return { rows: mockSetRows } as any;
            }
            return { rows: [mockSessionRow] } as any;
          });

          const result = await getSessionDetail(userId, sessionId);

          // Verify exact number of sets
          expect(result.sets).toHaveLength(sortedSets.length);

          // Verify each set has identical values (both sorted by set_number ASC)
          for (let i = 0; i < sortedSets.length; i++) {
            expect(result.sets[i].id).toBe(sortedSets[i].id);
            expect(result.sets[i].exerciseId).toBe(sortedSets[i].exerciseId);
            expect(result.sets[i].setNumber).toBe(sortedSets[i].setNumber);
            expect(result.sets[i].weightKg).toBe(sortedSets[i].weightKg);
            expect(result.sets[i].reps).toBe(sortedSets[i].reps);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 12: Session history ordering and pagination', () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * For any collection of sessions for a user, querying session history SHALL
   * return sessions ordered by session_date descending, with each page
   * containing at most 50 sessions.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return sessions in session_date DESC order with max 50 per page', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 5 }),
        fc.array(
          fc.record({
            id: fc.uuid(),
            split: splitArb,
            sessionDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
            completed: fc.boolean(),
          }),
          { minLength: 0, maxLength: 70 }
        ),
        async (userId, page, sessions) => {
          // Sort sessions by date DESC (simulating what the DB would return)
          const sortedSessions = [...sessions].sort(
            (a, b) => b.sessionDate.getTime() - a.sessionDate.getTime()
          );

          // Paginate: max 50 per page
          const pageSize = 50;
          const offset = (page - 1) * pageSize;
          const pageSlice = sortedSessions.slice(offset, offset + pageSize);

          /**
           * getSessionHistory uses Promise.all with two queries:
           * 1. "SELECT COUNT(*) AS count FROM sessions WHERE user_id = $1"
           * 2. "SELECT s.id ... FROM sessions ... ORDER BY session_date DESC LIMIT ..."
           *
           * Distinguish by checking if the query starts with "SELECT COUNT" (the count query)
           * vs the data query which starts with "SELECT s.id". Note: the data query also
           * contains COUNT(*) in a subquery, so a simple includes('COUNT') won't work.
           */
          mockQuery.mockImplementation(async (sql: string) => {
            const query = typeof sql === 'string' ? sql : '';
            if (query.trimStart().startsWith('SELECT COUNT')) {
              return { rows: [{ count: String(sessions.length) }] } as any;
            }
            // Data query - return the page slice in DESC order
            return {
              rows: pageSlice.map(s => ({
                id: s.id,
                user_id: userId,
                split: s.split,
                session_date: s.sessionDate.toISOString(),
                completed: s.completed,
                created_at: new Date().toISOString(),
              })),
            } as any;
          });

          const result = await getSessionHistory(userId, page);

          // Verify max 50 per page
          expect(result.sessions.length).toBeLessThanOrEqual(50);

          // Verify the count matches the expected page slice
          expect(result.sessions.length).toBe(pageSlice.length);

          // Verify sessions are in DESC order by session_date
          for (let i = 1; i < result.sessions.length; i++) {
            const prevDate = result.sessions[i - 1].sessionDate.getTime();
            const currDate = result.sessions[i].sessionDate.getTime();
            expect(prevDate).toBeGreaterThanOrEqual(currDate);
          }

          // Verify total count
          expect(result.total).toBe(sessions.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
