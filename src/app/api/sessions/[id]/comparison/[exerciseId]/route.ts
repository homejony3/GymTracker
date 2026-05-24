import { NextRequest, NextResponse } from 'next/server';
import { getPriorSessionSets } from '@/services/session.service';

/**
 * GET /api/sessions/[id]/comparison/[exerciseId]
 * Returns the most recent prior session's sets for a given exercise,
 * relative to the specified session.
 * Used for the comparison view in session detail.
 *
 * Requirements: 5.3, 5.4
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; exerciseId: string }> }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, exerciseId } = await params;

  const priorSets = await getPriorSessionSets(userId, exerciseId, id);

  return NextResponse.json({ priorSets });
}
