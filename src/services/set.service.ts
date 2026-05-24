import { pool } from '@/lib/db';
import { WEIGHT, REPS, SETS } from '@/lib/constants';
import type { WorkoutSet } from '@/types';

/**
 * Custom error class for set validation failures.
 */
export class SetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetValidationError';
  }
}

/**
 * Custom error class for set not found.
 */
export class SetNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetNotFoundError';
  }
}

/**
 * Validate weight value: must be in [0.0, 500.0] and a multiple of 0.5.
 */
function validateWeight(weightKg: number): void {
  if (weightKg < WEIGHT.MIN || weightKg > WEIGHT.MAX) {
    throw new SetValidationError(
      `Weight must be between ${WEIGHT.MIN} and ${WEIGHT.MAX} kg`
    );
  }
  if (weightKg % WEIGHT.STEP !== 0) {
    throw new SetValidationError(
      `Weight must be in ${WEIGHT.STEP} kg increments`
    );
  }
}

/**
 * Validate reps value: must be an integer in [1, 999].
 */
function validateReps(reps: number): void {
  if (!Number.isInteger(reps)) {
    throw new SetValidationError('Reps must be an integer');
  }
  if (reps < REPS.MIN || reps > REPS.MAX) {
    throw new SetValidationError(
      `Reps must be between ${REPS.MIN} and ${REPS.MAX}`
    );
  }
}

/**
 * Map a database row to a WorkoutSet object.
 */
function mapRowToWorkoutSet(row: Record<string, unknown>): WorkoutSet {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    exerciseId: row.exercise_id as string,
    setNumber: row.set_number as number,
    weightKg: parseFloat(row.weight_kg as string),
    reps: row.reps as number,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Log a new set within a session for a specific exercise.
 * - Validates weight and reps ranges
 * - Verifies session belongs to user and is not completed
 * - Enforces max 50 sets per exercise per session
 * - Auto-increments set_number
 */
export async function logSet(
  userId: string,
  sessionId: string,
  exerciseId: string,
  weightKg: number,
  reps: number
): Promise<WorkoutSet> {
  validateWeight(weightKg);
  validateReps(reps);

  // Verify session belongs to user and is not completed
  const sessionResult = await pool.query(
    `SELECT id, completed FROM sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );

  if (sessionResult.rows.length === 0) {
    throw new SetNotFoundError('Session not found');
  }

  if (sessionResult.rows[0].completed) {
    throw new SetValidationError('Cannot add sets to a completed session');
  }

  // Count existing sets for this exercise in this session
  const countResult = await pool.query(
    `SELECT COUNT(*) AS count FROM workout_sets
     WHERE session_id = $1 AND exercise_id = $2`,
    [sessionId, exerciseId]
  );

  const currentCount = parseInt(countResult.rows[0].count, 10);

  if (currentCount >= SETS.MAX) {
    throw new SetValidationError(
      `Maximum of ${SETS.MAX} sets per exercise per session reached`
    );
  }

  const setNumber = currentCount + 1;

  // Insert the new set
  const insertResult = await pool.query(
    `INSERT INTO workout_sets (session_id, exercise_id, set_number, weight_kg, reps)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, session_id, exercise_id, set_number, weight_kg, reps, created_at`,
    [sessionId, exerciseId, setNumber, weightKg, reps]
  );

  return mapRowToWorkoutSet(insertResult.rows[0]);
}

/**
 * Update an existing set's weight and reps.
 * - Validates weight and reps ranges
 * - Verifies the set exists, belongs to a session owned by the user, and session is not completed
 */
export async function updateSet(
  userId: string,
  setId: string,
  weightKg: number,
  reps: number
): Promise<WorkoutSet> {
  validateWeight(weightKg);
  validateReps(reps);

  // Verify the set exists and belongs to a session owned by the user
  const setResult = await pool.query(
    `SELECT ws.id, ws.session_id, s.completed
     FROM workout_sets ws
     JOIN sessions s ON s.id = ws.session_id
     WHERE ws.id = $1 AND s.user_id = $2`,
    [setId, userId]
  );

  if (setResult.rows.length === 0) {
    throw new SetNotFoundError('Set not found');
  }

  if (setResult.rows[0].completed) {
    throw new SetValidationError('Cannot edit sets in a completed session');
  }

  // Update the set
  const updateResult = await pool.query(
    `UPDATE workout_sets
     SET weight_kg = $1, reps = $2
     WHERE id = $3
     RETURNING id, session_id, exercise_id, set_number, weight_kg, reps, created_at`,
    [weightKg, reps, setId]
  );

  return mapRowToWorkoutSet(updateResult.rows[0]);
}

/**
 * Delete a set from a session.
 * - Verifies the set exists, belongs to a session owned by the user, and session is not completed
 */
export async function deleteSet(
  userId: string,
  setId: string
): Promise<void> {
  // Verify the set exists and belongs to a session owned by the user
  const setResult = await pool.query(
    `SELECT ws.id, ws.session_id, s.completed
     FROM workout_sets ws
     JOIN sessions s ON s.id = ws.session_id
     WHERE ws.id = $1 AND s.user_id = $2`,
    [setId, userId]
  );

  if (setResult.rows.length === 0) {
    throw new SetNotFoundError('Set not found');
  }

  if (setResult.rows[0].completed) {
    throw new SetValidationError('Cannot delete sets from a completed session');
  }

  // Delete the set
  await pool.query(`DELETE FROM workout_sets WHERE id = $1`, [setId]);
}
