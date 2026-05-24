import { pool } from '@/lib/db';
import { WEIGHT_INCREMENT } from '@/lib/constants';
import type { WeightSuggestion } from '@/types';

/**
 * Get the weight suggestion for an exercise based on progressive overload logic.
 *
 * Compares the two most recent completed sessions containing sets for the given exercise:
 * - If reps per set >= previous session's reps in all sets AND >= total sets → suggest weight + increment
 * - If any set has fewer reps or fewer total sets → suggest same weight (maintain)
 * - If only one session exists → suggest maintain at current weight
 * - If no prior history → return null suggestion with 'no_history' reasoning
 *
 * All queries are scoped to userId for data isolation.
 */
export async function getWeightSuggestion(
  userId: string,
  exerciseId: string
): Promise<WeightSuggestion> {
  // Get the exercise's configured weight_increment (default 1.0 kg)
  const exerciseResult = await pool.query(
    `SELECT weight_increment FROM exercises WHERE id = $1 AND user_id = $2`,
    [exerciseId, userId]
  );

  const incrementKg: number = exerciseResult.rows.length > 0
    ? parseFloat(exerciseResult.rows[0].weight_increment)
    : WEIGHT_INCREMENT.DEFAULT;

  // Find the two most recent completed sessions that contain sets for this exercise
  // Scoped to the authenticated user
  const sessionsResult = await pool.query(
    `SELECT DISTINCT s.id, s.session_date, s.created_at
     FROM sessions s
     INNER JOIN workout_sets ws ON ws.session_id = s.id
     WHERE s.user_id = $1
       AND s.completed = true
       AND ws.exercise_id = $2
     ORDER BY s.session_date DESC, s.created_at DESC
     LIMIT 2`,
    [userId, exerciseId]
  );

  // No history at all → no_history
  if (sessionsResult.rows.length === 0) {
    return {
      exerciseId,
      suggestedWeightKg: null,
      reasoning: 'no_history',
      previousWeightKg: null,
      incrementKg,
    };
  }

  // Get sets for the most recent session
  const mostRecentSessionId = sessionsResult.rows[0].id;
  const mostRecentSetsResult = await pool.query(
    `SELECT set_number, weight_kg, reps
     FROM workout_sets
     WHERE session_id = $1 AND exercise_id = $2
     ORDER BY set_number ASC`,
    [mostRecentSessionId, exerciseId]
  );

  const mostRecentSets = mostRecentSetsResult.rows.map((row) => ({
    setNumber: row.set_number as number,
    weightKg: parseFloat(row.weight_kg as string),
    reps: row.reps as number,
  }));

  // Determine the weight used in the most recent session (use the max weight from sets)
  const mostRecentWeight = Math.max(...mostRecentSets.map((s) => s.weightKg));

  // Only one session exists → maintain at current weight
  if (sessionsResult.rows.length === 1) {
    return {
      exerciseId,
      suggestedWeightKg: mostRecentWeight,
      reasoning: 'maintain',
      previousWeightKg: mostRecentWeight,
      incrementKg,
    };
  }

  // Get sets for the previous session
  const previousSessionId = sessionsResult.rows[1].id;
  const previousSetsResult = await pool.query(
    `SELECT set_number, weight_kg, reps
     FROM workout_sets
     WHERE session_id = $1 AND exercise_id = $2
     ORDER BY set_number ASC`,
    [previousSessionId, exerciseId]
  );

  const previousSets = previousSetsResult.rows.map((row) => ({
    setNumber: row.set_number as number,
    weightKg: parseFloat(row.weight_kg as string),
    reps: row.reps as number,
  }));

  // Compare: most recent must have >= total sets AND >= reps in every set
  const shouldIncrease = compareSessionSets(mostRecentSets, previousSets);

  if (shouldIncrease) {
    return {
      exerciseId,
      suggestedWeightKg: mostRecentWeight + incrementKg,
      reasoning: 'increase',
      previousWeightKg: mostRecentWeight,
      incrementKg,
    };
  }

  return {
    exerciseId,
    suggestedWeightKg: mostRecentWeight,
    reasoning: 'maintain',
    previousWeightKg: mostRecentWeight,
    incrementKg,
  };
}

/**
 * Compare two sessions' sets to determine if the most recent session
 * meets the criteria for a weight increase.
 *
 * Criteria for increase:
 * - Most recent session has >= number of total sets
 * - For each set position, most recent session has >= reps
 *
 * @returns true if weight should be increased, false if it should be maintained
 */
function compareSessionSets(
  mostRecent: { setNumber: number; reps: number }[],
  previous: { setNumber: number; reps: number }[]
): boolean {
  // Fewer total sets in most recent → maintain
  if (mostRecent.length < previous.length) {
    return false;
  }

  // Compare reps set-by-set (up to the number of sets in the previous session)
  for (let i = 0; i < previous.length; i++) {
    if (mostRecent[i].reps < previous[i].reps) {
      return false;
    }
  }

  return true;
}
