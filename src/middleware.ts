import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Middleware for authentication.
 * Uses Web Crypto API for Edge-compatible JWT verification.
 *
 * Requirements: 1.4, 1.5, 9.3, 9.5
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/**
 * Base64url decode to Uint8Array.
 */
function base64UrlDecode(str: string): Uint8Array {
  // Add padding
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  // Convert base64url to base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  // Decode
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify HS256 JWT using Web Crypto API (Edge Runtime compatible).
 */
async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Import the secret key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(JWT_SECRET);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Compute expected signature
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);

    // Convert computed signature to base64url
    const sigArray = new Uint8Array(signatureBuffer);
    let binary = '';
    for (let i = 0; i < sigArray.length; i++) {
      binary += String.fromCharCode(sigArray[i]);
    }
    const computedSignature = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Compare signatures
    if (computedSignature !== signatureB64) return null;

    // Decode payload
    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get('auth_token')?.value;
  const isApiRoute = pathname.startsWith('/api/');

  const payload = token ? await verifyToken(token) : null;

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
