import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/services/auth.service';

/** Lockout duration in seconds (15 minutes) */
const LOCKOUT_SECONDS = 900;

/** Cookie max age in seconds (30 days) */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * POST /api/auth/login
 * Authenticate user with username and password.
 * On success: sets HTTP-only auth_token cookie and returns user info.
 * On lockout: returns 429 with Retry-After header.
 * On invalid credentials: returns 401 with generic error message.
 */
export async function POST(request: NextRequest) {
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
    !('username' in body) ||
    !('password' in body) ||
    typeof (body as Record<string, unknown>).username !== 'string' ||
    typeof (body as Record<string, unknown>).password !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Username and password are required' },
      { status: 400 }
    );
  }

  const { username, password } = body as { username: string; password: string };

  if (!username.trim() || !password) {
    return NextResponse.json(
      { error: 'Username and password are required' },
      { status: 400 }
    );
  }

  // Authenticate
  const result = await authenticate(username, password);

  // Handle lockout
  if ('error' in result && result.locked) {
    return NextResponse.json(
      { error: result.error },
      {
        status: 429,
        headers: { 'Retry-After': String(LOCKOUT_SECONDS) },
      }
    );
  }

  // Handle invalid credentials
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error },
      { status: 401 }
    );
  }

  // Success — set HTTP-only cookie and return user info
  const response = NextResponse.json({
    user: {
      id: result.user.id,
      username: result.user.username,
      createdAt: result.user.createdAt,
    },
  });

  response.cookies.set('auth_token', result.token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}
