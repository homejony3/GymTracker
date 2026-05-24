import { pool } from '@/lib/db';
import { NAME_LENGTH } from '@/lib/constants';
import type { Exercise, WorkoutSplit } from '@/types';

/**
 * Validate exercise name: trim and check length constraints.
 * Returns the trimmed name or throws an error.
 */
function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < NAME_LENGTH.MIN || trimmed.length > NAME_LENGTH.MAX) {
    throw new ExerciseValidationError(
      `Exercise name must be between ${NAME_LENGTH.MIN} and ${NAME_LENGTH.MAX} characters`
    );
  }
  return trimmed;
}

/**
 * Custom error class for exercise validation failures.
 */
export class ExerciseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExerciseValidationError';
  }
}

/**
 * Custom error class for duplicate exercise name conflicts.
 */
export class ExerciseDuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExerciseDuplicateError';
  }
}

/**
 * Custom error class for exercise not found.
 */
export class ExerciseNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExerciseNotFoundError';
  }
}

/**
 * Map a database row to an Exercise object.
 */
function mapRowToExercise(row: Record<string, unknown>): Exercise {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    weightIncrement: parseFloat(row.weight_increment as string),
    splits: ((row.splits as string[] | null) ?? []) as WorkoutSplit[],
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Create a new exercise and associate it with a workout split.
 * - Trims the name and validates length (1-50 chars)
 * - Checks for case-insensitive duplicate name within the same split for the same user
 * - Inserts into exercises table, then into exercise_splits table
 */
export async function createExercise(
  userId: string,
  name: string,
  split: WorkoutSplit
): Promise<Exercise> {
  const trimmedName = validateName(name);

  // Check for case-insensitive duplicate within the same split for the same user
  const duplicateCheck = await pool.query(
    `SELECT e.id FROM exercises e
     JOIN exercise_splits es ON es.exercise_id = e.id
     WHERE e.user_id = $1
       AND es.split = $2
       AND LOWER(e.name) = LOWER($3)`,
    [userId, split, trimmedName]
  );

  if (duplicateCheck.rows.length > 0) {
    throw new ExerciseDuplicateError(
      'Exercise name already exists in this split'
    );
  }

  // Insert the exercise
  const exerciseResult = await pool.query(
    `INSERT INTO exercises (user_id, name)
     VALUES ($1, $2)
     RETURNING id, user_id, name, weight_increment, created_at`,
    [userId, trimmedName]
  );

  const exerciseRow = exerciseResult.rows[0];

  // Associate with the split
  await pool.query(
    `INSERT INTO exercise_splits (exercise_id, split)
     VALUES ($1, $2)`,
    [exerciseRow.id, split]
  );

  return {
    id: exerciseRow.id,
    userId: exerciseRow.user_id,
    name: exerciseRow.name,
    weightIncrement: parseFloat(exerciseRow.weight_increment),
    splits: [split],
    createdAt: new Date(exerciseRow.created_at),
  };
}

/**
 * Get all exercises for a user within a specific workout split.
 * - Ordered by added_at DESC (most recently added first)
 * - Limited to 50 exercises
 * - Includes all splits each exercise belongs to
 */
export async function getExercisesBySplit(
  userId: string,
  split: WorkoutSplit
): Promise<Exercise[]> {
  const result = await pool.query(
    `SELECT e.id, e.user_id, e.name, e.weight_increment, e.created_at,
            ARRAY(
              SELECT es2.split FROM exercise_splits es2
              WHERE es2.exercise_id = e.id
            ) AS splits
     FROM exercises e
     JOIN exercise_splits es ON es.exercise_id = e.id
     WHERE e.user_id = $1
       AND es.split = $2
     ORDER BY es.added_at DESC
     LIMIT 50`,
    [userId, split]
  );

  return result.rows.map(mapRowToExercise);
}

/**
 * Update an exercise's name.
 * - Validates the new name (trim, length check)
 * - Checks for case-insensitive duplicate within any split the exercise belongs to
 * - Only allows updating exercises owned by the user (data isolation)
 */
export async function updateExerciseName(
  userId: string,
  exerciseId: string,
  newName: string
): Promise<Exercise> {
  const trimmedName = validateName(newName);

  // Verify the exercise exists and belongs to the user
  const exerciseResult = await pool.query(
    `SELECT id, user_id, name, weight_increment, created_at
     FROM exercises
     WHERE id = $1 AND user_id = $2`,
    [exerciseId, userId]
  );

  if (exerciseResult.rows.length === 0) {
    throw new ExerciseNotFoundError('Exercise not found');
  }

  // Get all splits this exercise belongs to
  const splitsResult = await pool.query(
    `SELECT split FROM exercise_splits WHERE exercise_id = $1`,
    [exerciseId]
  );

  const exerciseSplits = splitsResult.rows.map((r) => r.split as WorkoutSplit);

  // Check for case-insensitive duplicate within any of the exercise's splits
  // (excluding the exercise itself)
  if (exerciseSplits.length > 0) {
    const duplicateCheck = await pool.query(
      `SELECT e.id FROM exercises e
       JOIN exercise_splits es ON es.exercise_id = e.id
       WHERE e.user_id = $1
         AND e.id != $2
         AND es.split = ANY($3)
         AND LOWER(e.name) = LOWER($4)`,
      [userId, exerciseId, exerciseSplits, trimmedName]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new ExerciseDuplicateError(
        'Exercise name already exists in this split'
      );
    }
  }

  // Update the name
  const updateResult = await pool.query(
    `UPDATE exercises
     SET name = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id, user_id, name, weight_increment, created_at`,
    [trimmedName, exerciseId, userId]
  );

  const row = updateResult.rows[0];

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    weightIncrement: parseFloat(row.weight_increment),
    splits: exerciseSplits,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Remove an exercise from a specific workout split.
 * - Only removes the association in exercise_splits (preserves the exercise and its history)
 * - Scoped to the user's exercises for data isolation
 */
export async function removeExerciseFromSplit(
  userId: string,
  exerciseId: string,
  split: WorkoutSplit
): Promise<void> {
  // Verify the exercise belongs to the user
  const exerciseResult = await pool.query(
    `SELECT id FROM exercises WHERE id = $1 AND user_id = $2`,
    [exerciseId, userId]
  );

  if (exerciseResult.rows.length === 0) {
    throw new ExerciseNotFoundError('Exercise not found');
  }

  // Remove the split association
  const deleteResult = await pool.query(
    `DELETE FROM exercise_splits
     WHERE exercise_id = $1 AND split = $2`,
    [exerciseId, split]
  );

  if (deleteResult.rowCount === 0) {
    throw new ExerciseNotFoundError('Exercise is not associated with this split');
  }
}
