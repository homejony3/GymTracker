import { NextResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * Clear the auth_token cookie to log the user out.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
