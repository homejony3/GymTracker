import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionDetail,
  SessionNotFoundError,
} from '@/services/session.service';

/**
 * GET /api/sessions/[id]
 * Get full session detail including all workout sets.
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 4.5, 5.1
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const session = await getSessionDetail(userId, id);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
