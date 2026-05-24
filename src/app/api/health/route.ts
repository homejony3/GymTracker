import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/db';

/**
 * GET /api/health
 * Returns application health status with database connectivity check.
 * Returns 200 if DB is reachable, 503 if not.
 * This endpoint is excluded from auth middleware.
 */
export async function GET() {
  const database = await healthCheck();

  const status = database ? 'ok' : 'degraded';
  const statusCode = database ? 200 : 503;

  return NextResponse.json(
    { status, database },
    { status: statusCode }
  );
}
