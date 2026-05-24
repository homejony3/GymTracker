import { NextRequest, NextResponse } from 'next/server';
import {
  logSet,
  SetNotFoundError,
  SetValidationError,
} from '@/services/set.service';

/**
 * POST /api/sets
 * Log a new set within a session.
 * Body: { sessionId: string, exerciseId: string, weightKg: number, reps: number }
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 4.4, 4.5, 5.2
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

  if (
    !body ||
    typeof body !== 'object' ||
    !('sessionId' in body) ||
    !('exerciseId' in body) ||
    !('weightKg' in body) ||
    !('reps' in body) ||
    typeof (body as Record<string, unknown>).sessionId !== 'string' ||
    typeof (body as Record<string, unknown>).exerciseId !== 'string' ||
    typeof (body as Record<string, unknown>).weightKg !== 'number' ||
    typeof (body as Record<string, unknown>).reps !== 'number'
  ) {
    return NextResponse.json(
      { error: 'Request body must include sessionId (string), exerciseId (string), weightKg (number), and reps (number)' },
      { status: 400 }
    );
  }

  const { sessionId, exerciseId, weightKg, reps } = body as {
    sessionId: string;
    exerciseId: string;
    weightKg: number;
    reps: number;
  };

  try {
    const set = await logSet(userId, sessionId, exerciseId, weightKg, reps);
    return NextResponse.json({ set }, { status: 201 });
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
