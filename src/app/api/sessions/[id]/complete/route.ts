import { NextRequest, NextResponse } from 'next/server';
import {
  completeSession,
  SessionNotFoundError,
  SessionValidationError,
} from '@/services/session.service';

/**
 * POST /api/sessions/[id]/complete
 * Mark a session as complete.
 * Requires at least 1 set to be logged.
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 4.7, 4.8
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const session = await completeSession(userId, id);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SessionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
