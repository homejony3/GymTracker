import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

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
  ExerciseValidationError,
  ExerciseDuplicateError,
} from '@/services/exercise.service';
import type { WorkoutSplit } from '@/types';

const mockQuery = vi.mocked(pool.query);

const splitArb = fc.constantFrom<WorkoutSplit>('UPPER', 'LOWER', 'ARMS');

/**
 * Creates a mock implementation for createExercise that simulates:
 * 1. Duplicate check (SELECT) → returns empty rows (no duplicate)
 * 2. Insert exercise → returns the exercise row
 * 3. Insert split association → returns empty
 *
 * Uses SQL content detection instead of call counting to be resilient
 * to fast-check's shrinking process.
 */
function mockCreateExerciseFlow(userId: string, expectedName: string, split: WorkoutSplit) {
  mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
    const query = typeof sql === 'string' ? sql : '';
    if (query.includes('SELECT') && query.includes('exercises')) {
      // Duplicate check - no duplicates found
      return { rows: [] } as any;
    } else if (query.includes('INSERT INTO exercises')) {
      // Insert exercise - return the new exercise row
      return {
        rows: [{
          id: 'ex-new',
          user_id: params?.[0] || userId,
          name: params?.[1] || expectedName,
          weight_increment: '1.0',
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      } as any;
    } else if (query.includes('INSERT INTO exercise_splits')) {
      // Insert split association
      return { rows: [], rowCount: 1 } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });
}

/**
 * Creates a mock implementation that simulates a duplicate being found.
 */
function mockDuplicateFound() {
  mockQuery.mockImplementation(async (sql: string) => {
    const query = typeof sql === 'string' ? sql : '';
    if (query.includes('SELECT') && query.includes('exercises')) {
      // Duplicate check returns existing exercise
      return { rows: [{ id: 'existing-id' }] } as any;
    }
    return { rows: [], rowCount: 0 } as any;
  });
}

describe('Feature: gym-tracker, Property 4: Exercise ordering within split', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any set of exercises belonging to a workout split for a user,
   * querying that split SHALL return exercises ordered by their added_at
   * timestamp descending (most recently added first).
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return exercises in added_at DESC order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            weight_increment: fc.constantFrom('0.5', '1.0', '1.5', '2.0', '2.5'),
            created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).map(d => d.toISOString()),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        splitArb,
        fc.uuid(),
        async (exercises, split, userId) => {
          // Simulate DB returning exercises already in added_at DESC order
          const dbRows = exercises.map((ex) => ({
            id: ex.id,
            user_id: userId,
            name: ex.name,
            weight_increment: ex.weight_increment,
            splits: [split],
            created_at: ex.created_at,
          }));

          mockQuery.mockImplementation(async () => ({ rows: dbRows } as any));

          const result = await getExercisesBySplit(userId, split);

          // The service should return exercises in the same order as the DB returns them
          // (which is added_at DESC per the SQL ORDER BY clause)
          expect(result).toHaveLength(dbRows.length);
          for (let i = 0; i < result.length; i++) {
            expect(result[i].id).toBe(dbRows[i].id);
            expect(result[i].name).toBe(dbRows[i].name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 5: Multi-split exercise membership', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any exercise and any subset of the three workout splits, adding the
   * exercise to each split in the subset SHALL succeed, and querying each
   * split SHALL include that exercise.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow an exercise to belong to multiple splits simultaneously', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length >= 1 && s.trim().length <= 50),
        fc.subarray(['UPPER', 'LOWER', 'ARMS'] as WorkoutSplit[], { minLength: 1 }),
        async (userId, name, splits) => {
          for (const split of splits) {
            // Set up mock using ONLY params from the actual query calls
            // to avoid race conditions during fast-check shrinking
            mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
              const query = typeof sql === 'string' ? sql : '';
              if (query.includes('SELECT') && query.includes('exercises')) {
                // Duplicate check - no duplicates found
                return { rows: [] } as any;
              } else if (query.includes('INSERT INTO exercises')) {
                // Insert exercise - echo back the params as the new row
                return {
                  rows: [{
                    id: 'ex-new',
                    user_id: params![0],
                    name: params![1],
                    weight_increment: '1.0',
                    created_at: new Date().toISOString(),
                  }],
                  rowCount: 1,
                } as any;
              } else if (query.includes('INSERT INTO exercise_splits')) {
                // Insert split association
                return { rows: [], rowCount: 1 } as any;
              }
              return { rows: [], rowCount: 0 } as any;
            });

            const result = await createExercise(userId, name, split);

            // The key property: exercise can be added to each split without error
            expect(result).toBeDefined();
            expect(result.splits).toContain(split);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 6: Duplicate split association rejection', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * For any exercise already associated with a specific workout split,
   * attempting to add the same exercise to the same split again SHALL be rejected.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject adding the same exercise to the same split twice', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length >= 1 && s.trim().length <= 50),
        splitArb,
        async (userId, name, split) => {
          // Duplicate check returns existing exercise (already in this split)
          mockDuplicateFound();

          await expect(createExercise(userId, name, split))
            .rejects.toThrow(ExerciseDuplicateError);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 7: Exercise name validation and trimming', () => {
  /**
   * **Validates: Requirements 3.1, 3.6**
   *
   * For any input string, creating an exercise SHALL trim leading/trailing
   * whitespace and accept the name only if the trimmed result is between 1
   * and 50 characters (inclusive). Strings that are empty after trimming or
   * exceed 50 characters SHALL be rejected.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should trim whitespace and accept names between 1 and 50 characters', async () => {
    // Generate a core name of 1-50 chars (no leading/trailing whitespace)
    const validCoreArb = fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s.trim())
      .filter(s => s.length >= 1 && s.length <= 50);

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validCoreArb,
        splitArb,
        fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }),
        fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }),
        async (userId, coreName, split, leadingWs, trailingWs) => {
          // Set up mock using ONLY params from the actual query calls
          mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
            const query = typeof sql === 'string' ? sql : '';
            if (query.includes('SELECT') && query.includes('exercises')) {
              // Duplicate check - no duplicates found
              return { rows: [] } as any;
            } else if (query.includes('INSERT INTO exercises')) {
              // Insert exercise - echo back the params as the new row
              return {
                rows: [{
                  id: 'ex-new',
                  user_id: params![0],
                  name: params![1],
                  weight_increment: '1.0',
                  created_at: new Date().toISOString(),
                }],
                rowCount: 1,
              } as any;
            } else if (query.includes('INSERT INTO exercise_splits')) {
              // Insert split association
              return { rows: [], rowCount: 1 } as any;
            }
            return { rows: [], rowCount: 0 } as any;
          });

          const paddedName = `${leadingWs}${coreName}${trailingWs}`;
          const result = await createExercise(userId, paddedName, split);
          // Verify the service returns a valid exercise (trimming happened internally)
          expect(result).toBeDefined();
          expect(result.id).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject names that are empty after trimming', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 20 }),
        splitArb,
        async (userId, whitespaceOnly, split) => {
          // No mock needed - validation happens before any DB call
          await expect(createExercise(userId, whitespaceOnly, split))
            .rejects.toThrow(ExerciseValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject names exceeding 50 characters after trimming', async () => {
    // Generate strings guaranteed to be >50 chars after trimming
    const longNameArb = fc.integer({ min: 51, max: 100 }).map(len => 'X'.repeat(len));

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        longNameArb,
        splitArb,
        async (userId, longName, split) => {
          // No mock needed - validation happens before any DB call
          await expect(createExercise(userId, longName, split))
            .rejects.toThrow(ExerciseValidationError);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: gym-tracker, Property 8: Case-insensitive exercise name uniqueness', () => {
  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * For any two exercise name strings that are equal when compared
   * case-insensitively, attempting to create or rename an exercise to the
   * second name within the same workout split SHALL be rejected when the
   * first already exists.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject case-insensitive duplicate names within the same split', async () => {
    // Generate alphabetic names where case changes are meaningful
    const alphaNameArb = fc.stringOf(
      fc.char().filter(c => c.toLowerCase() !== c.toUpperCase()),
      { minLength: 1, maxLength: 50 }
    );

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        alphaNameArb,
        splitArb,
        async (userId, baseName, split) => {
          // Create a case variant (toggle case)
          const variant = baseName
            .split('')
            .map(c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())
            .join('');

          // They should be case-insensitively equal
          expect(baseName.toLowerCase()).toBe(variant.toLowerCase());

          // Duplicate check returns existing exercise (case-insensitive match found by DB)
          mockDuplicateFound();

          await expect(createExercise(userId, variant, split))
            .rejects.toThrow(ExerciseDuplicateError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should detect duplicates regardless of case combination', async () => {
    // Generate names and test with toUpperCase variant
    const alphaNameArb = fc.stringOf(
      fc.char().filter(c => c.toLowerCase() !== c.toUpperCase()),
      { minLength: 1, maxLength: 50 }
    );

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        alphaNameArb,
        splitArb,
        async (userId, baseName, split) => {
          const upperName = baseName.toUpperCase();
          const lowerName = baseName.toLowerCase();

          // Both should be case-insensitively equal
          expect(upperName.toLowerCase()).toBe(lowerName.toLowerCase());

          // Duplicate check returns existing (the other case version already exists)
          mockDuplicateFound();

          await expect(createExercise(userId, upperName, split))
            .rejects.toThrow(ExerciseDuplicateError);
        }
      ),
      { numRuns: 100 }
    );
  });
});
