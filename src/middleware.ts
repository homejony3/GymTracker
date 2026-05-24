import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

/**
 * Next.js Middleware for authentication.
 * Uses Node.js crypto module for JWT verification.
 *
 * Requirements: 1.4, 1.5, 9.3, 9.5
 */

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/**
 * Verify HS256 JWT using Node.js crypto.
 */
function verifyToken(token: string): { userId: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature using HMAC-SHA256
    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (expectedSignature !== signatureB64) return null;

    // Decode payload
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (typeof payload.userId === 'string') {
      return { userId: payload.userId };
    }

    return null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get('auth_token')?.value;
  const isApiRoute = pathname.startsWith('/api/');

  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    } else {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    '/((?!login|api/auth/login|api/health|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
