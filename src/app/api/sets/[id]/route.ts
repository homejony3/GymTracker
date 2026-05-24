import { NextRequest, NextResponse } from 'next/server';
import {
  updateSet,
  deleteSet,
  SetNotFoundError,
  SetValidationError,
} from '@/services/set.service';

/**
 * PUT /api/sets/[id]
 * Update an existing set's weight and reps.
 * Body: { weightKg: number, reps: number }
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 4.5, 5.2
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

  if (
    !body ||
    typeof body !== 'object' ||
    !('weightKg' in body) ||
    !('reps' in body) ||
    typeof (body as Record<string, unknown>).weightKg !== 'number' ||
    typeof (body as Record<string, unknown>).reps !== 'number'
  ) {
    return NextResponse.json(
      { error: 'Request body must include weightKg (number) and reps (number)' },
      { status: 400 }
    );
  }

  const { weightKg, reps } = body as { weightKg: number; reps: number };

  try {
    const set = await updateSet(userId, id, weightKg, reps);
    return NextResponse.json({ set });
  } catch (error) {
    if (error instanceof SetNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SetValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

/**
 * DELETE /api/sets/[id]
 * Delete a set from a session.
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 4.5, 5.2
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

  try {
    await deleteSet(userId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SetNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SetValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
