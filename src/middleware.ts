import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

/**
 * Next.js Middleware for authentication.
 *
 * - Validates JWT from `auth_token` HTTP-only cookie
 * - For API routes: returns 401 JSON if no valid token
 * - For page routes: redirects to /login if no valid token
 * - Passes userId via x-user-id header for downstream handlers
 *
 * Requirements: 1.4, 1.5, 9.3, 9.5
 */

/** JWT secret — must match the one used in auth.service.ts */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/**
 * Verify a JWT token and extract the userId.
 * Returns null if the token is invalid or expired.
 */
function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    if (payload && typeof payload.userId === 'string') {
      return { userId: payload.userId };
    }
    return null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the auth token from the HTTP-only cookie
  const token = request.cookies.get('auth_token')?.value;

  // Determine if this is an API route
  const isApiRoute = pathname.startsWith('/api/');

  // Verify the token
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    // Unauthenticated
    if (isApiRoute) {
      // API routes: return 401 JSON response
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    } else {
      // Page routes: redirect to /login
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Authenticated — attach userId to request headers for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

/**
 * Middleware matcher configuration.
 * Protects all routes EXCEPT:
 * - /login (login page)
 * - /api/auth/login (login API endpoint)
 * - /api/health (health check endpoint)
 * - /_next (Next.js internals)
 * - /favicon.ico, static files
 */
export const config = {
  matcher: [
    '/((?!login|api/auth/login|api/health|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
