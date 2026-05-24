import { NextRequest, NextResponse } from 'next/server';
import { WORKOUT_SPLITS, type WorkoutSplit } from '@/types';
import {
  createExercise,
  getExercisesBySplit,
  ExerciseValidationError,
  ExerciseDuplicateError,
} from '@/services/exercise.service';

/**
 * GET /api/exercises?split=UPPER
 * List exercises for a specific workout split.
 * Requires `split` query param (UPPER, LOWER, or ARMS).
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 2.2, 9.2, 9.3
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const split = request.nextUrl.searchParams.get('split');

  if (!split) {
    return NextResponse.json(
      { error: 'Missing required query parameter: split' },
      { status: 400 }
    );
  }

  if (!WORKOUT_SPLITS.includes(split as WorkoutSplit)) {
    return NextResponse.json(
      { error: `Invalid split value. Must be one of: ${WORKOUT_SPLITS.join(', ')}` },
      { status: 400 }
    );
  }

  const exercises = await getExercisesBySplit(userId, split as WorkoutSplit);

  return NextResponse.json({ exercises });
}

/**
 * POST /api/exercises
 * Create a new exercise and associate it with a workout split.
 * Body: { name: string, split: WorkoutSplit }
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 2.3, 3.1, 3.4, 3.5, 3.6, 9.3
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Validate request body structure
  if (
    !body ||
    typeof body !== 'object' ||
    !('name' in body) ||
    !('split' in body) ||
    typeof (body as Record<string, unknown>).name !== 'string' ||
    typeof (body as Record<string, unknown>).split !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Request body must include name (string) and split (string)' },
      { status: 400 }
    );
  }

  const { name, split } = body as { name: string; split: string };

  // Validate split value
  if (!WORKOUT_SPLITS.includes(split as WorkoutSplit)) {
    return NextResponse.json(
      { error: `Invalid split value. Must be one of: ${WORKOUT_SPLITS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const exercise = await createExercise(userId, name, split as WorkoutSplit);
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    if (error instanceof ExerciseValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ExerciseDuplicateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
