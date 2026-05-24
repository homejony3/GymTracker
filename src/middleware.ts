import { NextRequest, NextResponse } from 'next/server';

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
 * Lightweight JWT verification for Edge Runtime.
 * Verifies HS256 tokens using Web Crypto API (no Node.js crypto dependency).
 * Returns the decoded payload or null if invalid/expired.
 */
async function verifyTokenEdge(token: string): Promise<{ userId: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify the signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Convert base64url signature to ArrayBuffer
    const signature = base64UrlToArrayBuffer(signatureB64);
    const data = encoder.encode(`${headerB64}.${payloadB64}`);

    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;

    // Decode and validate payload
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Validate userId exists
    if (payload && typeof payload.userId === 'string') {
      return { userId: payload.userId };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Convert a base64url-encoded string to an ArrayBuffer.
 */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the auth token from the HTTP-only cookie
  const token = request.cookies.get('auth_token')?.value;

  // Determine if this is an API route
  const isApiRoute = pathname.startsWith('/api/');

  // Verify the token
  const payload = token ? await verifyTokenEdge(token) : null;

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
    /*
     * Match all request paths except:
     * - /login
     * - /api/auth/login
     * - /api/health
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico
     */
    '/((?!login|api/auth/login|api/health|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
