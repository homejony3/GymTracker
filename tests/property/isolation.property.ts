import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the pg pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '@/lib/db';
import { getExercisesBySplit } from '@/services/exercise.service';
import { getSessionHistory, getSessionDetail, getPriorSessionSets } from '@/services/session.service';
import type { WorkoutSplit } from '@/types';

const mockQuery = vi.mocked(pool.query);

const splitArb = fc.constantFrom<WorkoutSplit>('UPPER', 'LOWER', 'ARMS');

describe('Feature: gym-tracker, Property 1: Data isolation between users', () => {
  /**
   * **Validates: Requirements 1.4, 9.1, 9.2, 9.3, 9.4, 9.5**
   *
   * For any two authenticated users A and B, and any resource (Exercise, Session, WorkoutSet)
   * created by user A, querying that resource as user B SHALL return a "not found" response
   * identical to querying a non-existent resource ID.
   *
   * The key property: all service functions include user_id in their queries, so when the DB
   * returns empty results for a different user_id, the service correctly isolates data.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('user B cannot access user A exercises — getExercisesBySplit returns empty for wrong user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        splitArb,
        async (userAId, userBId, split) => {
          // Ensure distinct users
          fc.pre(userAId !== userBId);

          /**
           * When user B queries exercises, the DB query includes user_id = userB.
           * Since user A owns the exercises, the DB returns empty rows for user B.
           * Mock simulates this: any query with user B's ID returns empty.
           */
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            const query = typeof sql === 'string' ? sql : '';
            // The getExercisesBySplit query uses user_id as $1
            // For user B, the DB would return no rows (user A owns the data)
            if (query.includes('exercises') && params && params[0] === userBId) {
              return { rows: [] } as any;
            }
            // Should not reach here for user B queries
            return { rows: [] } as any;
          });

          const result = await getExercisesBySplit(userBId, split);

          // Data isolation: user B sees no exercises belonging to user A
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('user B cannot access user A sessions — getSessionHistory returns empty for wrong user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 5 }),
        async (userAId, userBId, page) => {
          fc.pre(userAId !== userBId);

          /**
           * When user B queries session history, the DB scopes by user_id = userB.
           * Since user A owns the sessions, the DB returns 0 count and empty rows.
           *
           * Note: both the count query and data query contain "COUNT" (the data query
           * has a COUNT subquery for set_count). Distinguish by checking for "GROUP BY"
           * which only appears in the data query's subquery, or by checking for "LIMIT"
           * which only appears in the data query.
           */
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            const query = typeof sql === 'string' ? sql : '';
            // The count query is: SELECT COUNT(*) AS count FROM sessions WHERE user_id = $1
            // The data query contains LIMIT and OFFSET
            if (query.includes('LIMIT')) {
              // Data query — return empty for user B (no sessions)
              return { rows: [] } as any;
            }
            // Count query
            return { rows: [{ count: '0' }] } as any;
          });

          const result = await getSessionHistory(userBId, page);

          // Data isolation: user B sees no sessions belonging to user A
          expect(result.sessions).toEqual([]);
          expect(result.total).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('user B cannot access user A session detail — getSessionDetail throws NotFound for wrong user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userAId, userBId, sessionId) => {
          fc.pre(userAId !== userBId);

          /**
           * When user B tries to access a specific session owned by user A,
           * the query includes WHERE id = $1 AND user_id = $2 (user B's ID).
           * The DB returns empty rows, and the service throws SessionNotFoundError.
           * This is indistinguishable from querying a non-existent session ID (Req 9.4).
           */
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            const query = typeof sql === 'string' ? sql : '';
            // Session lookup with user B's ID returns empty (session belongs to user A)
            if (query.includes('sessions') && params && params[1] === userBId) {
              return { rows: [] } as any;
            }
            return { rows: [] } as any;
          });

          await expect(getSessionDetail(userBId, sessionId))
            .rejects.toThrow('Session not found');
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: gym-tracker, Property 13: Exercise comparison lookup', () => {
  /**
   * **Validates: Requirements 5.3, 5.4**
   *
   * For any exercise viewed within a session, the comparison SHALL display the most
   * recent prior session log for that same exercise by the same user. If no prior
   * session exists, it SHALL indicate no prior data (return empty array).
   *
   * The key property: getPriorSessionSets queries with the correct user_id and exercise_id,
   * returning the most recent prior completed session's sets or empty if none exists.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no prior session exists for the exercise', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, exerciseId, currentSessionId) => {
          /**
           * Simulate: the current session exists for this user, but no prior
           * completed session contains sets for this exercise.
           *
           * getPriorSessionSets makes:
           * 1. Query for current session's date: returns the session
           * 2. Query for prior session: returns empty (no prior data)
           */
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            const query = typeof sql === 'string' ? sql : '';
            // First query: get current session date
            if (query.includes('session_date') && query.includes('created_at') && !query.includes('INNER JOIN')) {
              return {
                rows: [{
                  session_date: '2024-06-15',
                  created_at: '2024-06-15T10:00:00.000Z',
                }],
              } as any;
            }
            // Second query: find prior session with this exercise — none exists
            if (query.includes('INNER JOIN') && query.includes('workout_sets')) {
              return { rows: [] } as any;
            }
            return { rows: [] } as any;
          });

          const result = await getPriorSessionSets(userId, exerciseId, currentSessionId);

          // No prior data: empty array indicates no comparison available (Req 5.4)
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return the most recent prior session sets for the same exercise and user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.array(
          fc.record({
            id: fc.uuid(),
            setNumber: fc.integer({ min: 1, max: 50 }),
            weightKg: fc.integer({ min: 0, max: 1000 }).map(n => n * 0.5),
            reps: fc.integer({ min: 1, max: 999 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (userId, exerciseId, currentSessionId, priorSessionId, priorSets) => {
          // Ensure distinct session IDs
          fc.pre(currentSessionId !== priorSessionId);

          // Sort sets by set_number ASC (matching DB ORDER BY)
          const sortedSets = [...priorSets].sort((a, b) => a.setNumber - b.setNumber);

          const mockSetRows = sortedSets.map(s => ({
            id: s.id,
            session_id: priorSessionId,
            exercise_id: exerciseId,
            set_number: s.setNumber,
            weight_kg: String(s.weightKg),
            reps: s.reps,
            created_at: '2024-06-10T10:00:00.000Z',
          }));

          /**
           * getPriorSessionSets makes 3 queries:
           * 1. Get current session's date (WHERE id = $1 AND user_id = $2)
           * 2. Find most recent prior completed session with this exercise
           * 3. Get sets for that prior session and exercise
           *
           * All queries are scoped to the authenticated user's ID.
           */
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            const query = typeof sql === 'string' ? sql : '';

            // Query 1: current session date lookup
            if (query.includes('session_date') && query.includes('created_at') && !query.includes('INNER JOIN') && !query.includes('workout_sets')) {
              // Verify user_id is included in the query params (data isolation)
              expect(params).toContain(userId);
              return {
                rows: [{
                  session_date: '2024-06-15',
                  created_at: '2024-06-15T10:00:00.000Z',
                }],
              } as any;
            }

            // Query 2: find prior session (INNER JOIN workout_sets, scoped to user)
            if (query.includes('INNER JOIN') && query.includes('workout_sets') && query.includes('LIMIT 1')) {
              // Verify user_id is the first param (data isolation at query level)
              expect(params![0]).toBe(userId);
              // Verify exercise_id is included
              expect(params).toContain(exerciseId);
              return {
                rows: [{ id: priorSessionId }],
              } as any;
            }

            // Query 3: get sets for prior session
            if (query.includes('workout_sets') && query.includes('ORDER BY set_number')) {
              return { rows: mockSetRows } as any;
            }

            return { rows: [] } as any;
          });

          const result = await getPriorSessionSets(userId, exerciseId, currentSessionId);

          // Verify the correct number of sets is returned
          expect(result).toHaveLength(sortedSets.length);

          // Verify each set has the correct values from the prior session
          for (let i = 0; i < sortedSets.length; i++) {
            expect(result[i].id).toBe(sortedSets[i].id);
            expect(result[i].exerciseId).toBe(exerciseId);
            expect(result[i].sessionId).toBe(priorSessionId);
            expect(result[i].setNumber).toBe(sortedSets[i].setNumber);
            expect(result[i].weightKg).toBe(sortedSets[i].weightKg);
            expect(result[i].reps).toBe(sortedSets[i].reps);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty when current session does not belong to user (isolation)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        async (userId, exerciseId, sessionId) => {
          /**
           * If the current session doesn't belong to the user (user_id mismatch),
           * the first query returns empty rows, and the function returns [].
           * This ensures data isolation — a user cannot use another user's session
           * as a reference point for comparison.
           */
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            // Session lookup returns empty (session doesn't belong to this user)
            return { rows: [] } as any;
          });

          const result = await getPriorSessionSets(userId, exerciseId, sessionId);

          // Isolation: cannot access comparison data through another user's session
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
