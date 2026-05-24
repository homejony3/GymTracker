import { NextRequest, NextResponse } from 'next/server';
import { WORKOUT_SPLITS, type WorkoutSplit } from '@/types';
import {
  createSession,
  getSessionHistory,
} from '@/services/session.service';

/**
 * GET /api/sessions?page=1&split=UPPER
 * Get paginated session history for the authenticated user.
 * - page defaults to 1
 * - split is optional filter (UPPER, LOWER, ARMS)
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 4.1, 4.2, 5.1
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pageParam = request.nextUrl.searchParams.get('page');
  const splitParam = request.nextUrl.searchParams.get('split');

  const page = pageParam ? parseInt(pageParam, 10) : 1;

  if (isNaN(page) || page < 1) {
    return NextResponse.json(
      { error: 'Page must be a positive integer' },
      { status: 400 }
    );
  }

  if (splitParam && !WORKOUT_SPLITS.includes(splitParam as WorkoutSplit)) {
    return NextResponse.json(
      { error: `Invalid split value. Must be one of: ${WORKOUT_SPLITS.join(', ')}` },
      { status: 400 }
    );
  }

  const split = splitParam ? (splitParam as WorkoutSplit) : undefined;
  const result = await getSessionHistory(userId, page, split);

  return NextResponse.json(result);
}

/**
 * POST /api/sessions
 * Create a new workout session.
 * Body: { split: WorkoutSplit }
 * Scoped to authenticated user via x-user-id header.
 *
 * Requirements: 4.4, 5.2
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
    !('split' in body) ||
    typeof (body as Record<string, unknown>).split !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Request body must include split (string)' },
      { status: 400 }
    );
  }

  const { split } = body as { split: string };

  if (!WORKOUT_SPLITS.includes(split as WorkoutSplit)) {
    return NextResponse.json(
      { error: `Invalid split value. Must be one of: ${WORKOUT_SPLITS.join(', ')}` },
      { status: 400 }
    );
  }

  const session = await createSession(userId, split as WorkoutSplit);
  return NextResponse.json({ session }, { status: 201 });
}
