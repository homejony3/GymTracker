import { NextRequest, NextResponse } from 'next/server';
import { getWeightSuggestion } from '@/services/suggestion.service';

/**
 * GET /api/suggestions/[exerciseId]
 * Returns the progressive overload weight suggestion for a given exercise.
 * Scoped to authenticated user via x-user-id header (set by middleware).
 *
 * Requirements: 6.1, 6.5, 9.2
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { exerciseId } = await params;

  const suggestion = await getWeightSuggestion(userId, exerciseId);

  return NextResponse.json(suggestion);
}
