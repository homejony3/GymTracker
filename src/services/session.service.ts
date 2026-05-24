import { pool } from '@/lib/db';
import type { Session, WorkoutSet, WorkoutSplit } from '@/types';

/**
 * Custom error class for session not found.
 */
export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Custom error class for session validation failures.
 */
export class SessionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionValidationError';
  }
}

/** Page size for session history pagination */
const PAGE_SIZE = 50;

/**
 * Map a database row to a Session object.
 */
function mapRowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    split: row.split as WorkoutSplit,
    sessionDate: new Date(row.session_date as string),
    completed: row.completed as boolean,
    createdAt: new Date(row.created_at as string),
  };
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
 * Create a new workout session associated with the current date.
 * - Associates the session with the authenticated user
 * - Sets session_date to the current date
 * - Initializes completed as false
 */
export async function createSession(
  userId: string,
  split: WorkoutSplit
): Promise<Session> {
  const result = await pool.query(
    `INSERT INTO sessions (user_id, split, session_date)
     VALUES ($1, $2, CURRENT_DATE)
     RETURNING id, user_id, split, session_date, completed, created_at`,
    [userId, split]
  );

  return mapRowToSession(result.rows[0]);
}

/**
 * Mark a session as complete.
 * - Validates that at least 1 workout set exists for the session
 * - Only allows completing sessions owned by the authenticated user
 * - Throws SessionNotFoundError if session doesn't exist or doesn't belong to user
 * - Throws SessionValidationError if no sets have been logged
 */
export async function completeSession(
  userId: string,
  sessionId: string
): Promise<Session> {
  // Verify the session exists and belongs to the user
  const sessionResult = await pool.query(
    `SELECT id, user_id, split, session_date, completed, created_at
     FROM sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );

  if (sessionResult.rows.length === 0) {
    throw new SessionNotFoundError('Session not found');
  }

  // Check that at least 1 workout set exists for this session
  const setCountResult = await pool.query(
    `SELECT COUNT(*) AS count FROM workout_sets WHERE session_id = $1`,
    [sessionId]
  );

  const setCount = parseInt(setCountResult.rows[0].count, 10);
  if (setCount === 0) {
    throw new SessionValidationError(
      'Cannot complete session with no sets logged. At least one set must be logged.'
    );
  }

  // Update the session to completed
  const updateResult = await pool.query(
    `UPDATE sessions
     SET completed = true
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, split, session_date, completed, created_at`,
    [sessionId, userId]
  );

  return mapRowToSession(updateResult.rows[0]);
}

/** Session with set count for history listing */
export interface SessionWithSetCount extends Session {
  setCount: number;
}

/**
 * Get paginated session history for a user.
 * - Ordered by session_date DESC (most recent first)
 * - 50 sessions per page
 * - Optional filter by workout split
 * - Returns sessions (with set counts) and total count
 */
export async function getSessionHistory(
  userId: string,
  page: number,
  split?: WorkoutSplit
): Promise<{ sessions: SessionWithSetCount[]; total: number }> {
  const offset = (page - 1) * PAGE_SIZE;

  let countQuery: string;
  let dataQuery: string;
  let params: (string | number)[];

  if (split) {
    countQuery = `SELECT COUNT(*) AS count FROM sessions WHERE user_id = $1 AND split = $2`;
    dataQuery = `SELECT s.id, s.user_id, s.split, s.session_date, s.completed, s.created_at,
                        COALESCE(ws.set_count, 0) AS set_count
                 FROM sessions s
                 LEFT JOIN (
                   SELECT session_id, COUNT(*) AS set_count
                   FROM workout_sets
                   GROUP BY session_id
                 ) ws ON ws.session_id = s.id
                 WHERE s.user_id = $1 AND s.split = $2
                 ORDER BY s.session_date DESC
                 LIMIT $3 OFFSET $4`;
    params = [userId, split, PAGE_SIZE, offset];
  } else {
    countQuery = `SELECT COUNT(*) AS count FROM sessions WHERE user_id = $1`;
    dataQuery = `SELECT s.id, s.user_id, s.split, s.session_date, s.completed, s.created_at,
                        COALESCE(ws.set_count, 0) AS set_count
                 FROM sessions s
                 LEFT JOIN (
                   SELECT session_id, COUNT(*) AS set_count
                   FROM workout_sets
                   GROUP BY session_id
                 ) ws ON ws.session_id = s.id
                 WHERE s.user_id = $1
                 ORDER BY s.session_date DESC
                 LIMIT $2 OFFSET $3`;
    params = [userId, PAGE_SIZE, offset];
  }

  const countParams = split ? [userId, split] : [userId];
  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, countParams),
    pool.query(dataQuery, params),
  ]);

  const total = parseInt(countResult.rows[0].count, 10);
  const sessions: SessionWithSetCount[] = dataResult.rows.map((row) => ({
    ...mapRowToSession(row),
    setCount: parseInt(row.set_count as string, 10),
  }));

  return { sessions, total };
}

/**
 * Get full session detail including all workout sets.
 * - Verifies the session belongs to the authenticated user
 * - Returns the session with all associated workout sets
 * - Throws SessionNotFoundError if session doesn't exist or doesn't belong to user
 */
export async function getSessionDetail(
  userId: string,
  sessionId: string
): Promise<Session & { sets: WorkoutSet[] }> {
  // Verify the session exists and belongs to the user
  const sessionResult = await pool.query(
    `SELECT id, user_id, split, session_date, completed, created_at
     FROM sessions
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );

  if (sessionResult.rows.length === 0) {
    throw new SessionNotFoundError('Session not found');
  }

  const session = mapRowToSession(sessionResult.rows[0]);

  // Get all workout sets for this session
  const setsResult = await pool.query(
    `SELECT id, session_id, exercise_id, set_number, weight_kg, reps, created_at
     FROM workout_sets
     WHERE session_id = $1
     ORDER BY set_number ASC`,
    [sessionId]
  );

  const sets = setsResult.rows.map(mapRowToWorkoutSet);

  return { ...session, sets };
}

/**
 * Get the most recent prior session's sets for a given exercise,
 * relative to a specific session date.
 * Returns the sets from the most recent completed session before the given date
 * that contains sets for the specified exercise.
 * Returns an empty array if no prior session exists.
 *
 * Requirements: 5.3, 5.4
 */
export async function getPriorSessionSets(
  userId: string,
  exerciseId: string,
  beforeSessionId: string
): Promise<WorkoutSet[]> {
  // Get the session date of the current session
  const currentSessionResult = await pool.query(
    `SELECT session_date, created_at FROM sessions WHERE id = $1 AND user_id = $2`,
    [beforeSessionId, userId]
  );

  if (currentSessionResult.rows.length === 0) {
    return [];
  }

  const currentDate = currentSessionResult.rows[0].session_date;
  const currentCreatedAt = currentSessionResult.rows[0].created_at;

  // Find the most recent completed session before this one that has sets for this exercise
  const priorSessionResult = await pool.query(
    `SELECT s.id
     FROM sessions s
     INNER JOIN workout_sets ws ON ws.session_id = s.id
     WHERE s.user_id = $1
       AND s.completed = true
       AND ws.exercise_id = $2
       AND s.id != $3
       AND (s.session_date < $4 OR (s.session_date = $4 AND s.created_at < $5))
     ORDER BY s.session_date DESC, s.created_at DESC
     LIMIT 1`,
    [userId, exerciseId, beforeSessionId, currentDate, currentCreatedAt]
  );

  if (priorSessionResult.rows.length === 0) {
    return [];
  }

  const priorSessionId = priorSessionResult.rows[0].id;

  // Get the sets for that prior session and exercise
  const setsResult = await pool.query(
    `SELECT id, session_id, exercise_id, set_number, weight_kg, reps, created_at
     FROM workout_sets
     WHERE session_id = $1 AND exercise_id = $2
     ORDER BY set_number ASC`,
    [priorSessionId, exerciseId]
  );

  return setsResult.rows.map(mapRowToWorkoutSet);
}
