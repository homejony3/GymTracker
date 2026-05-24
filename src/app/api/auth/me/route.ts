import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

/**
 * GET /api/auth/me
 * Return the current authenticated user's info.
 * Reads the x-user-id header set by the auth middleware.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const result = await pool.query(
    'SELECT id, username, created_at FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  const row = result.rows[0];

  return NextResponse.json({
    user: {
      id: row.id,
      username: row.username,
      createdAt: new Date(row.created_at),
    },
  });
}
