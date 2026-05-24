import { NextRequest, NextResponse } from 'next/server';
import { WORKOUT_SPLITS, type WorkoutSplit } from '@/types';
import {
  updateExerciseName,
  removeExerciseFromSplit,
  ExerciseValidationError,
  ExerciseDuplicateError,
  ExerciseNotFoundError,
} from '@/services/exercise.service';

/**
 * PUT /api/exercises/[id]
 * Rename an exercise.
 * Body: { name: string }
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 3.2, 3.4, 3.5, 3.6, 9.3, 9.4
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Validate request body
  if (
    !body ||
    typeof body !== 'object' ||
    !('name' in body) ||
    typeof (body as Record<string, unknown>).name !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Request body must include name (string)' },
      { status: 400 }
    );
  }

  const { name } = body as { name: string };

  try {
    const exercise = await updateExerciseName(userId, id, name);
    return NextResponse.json({ exercise });
  } catch (error) {
    if (error instanceof ExerciseValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ExerciseNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ExerciseDuplicateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

/**
 * DELETE /api/exercises/[id]?split=UPPER
 * Remove an exercise from a specific workout split.
 * Requires `split` query param (UPPER, LOWER, or ARMS).
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 2.5, 3.3, 9.3, 9.4
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
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

  try {
    await removeExerciseFromSplit(userId, id, split as WorkoutSplit);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ExerciseNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
