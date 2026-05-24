import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// We need to mock Next.js server modules for the middleware test
const mockRedirect = vi.fn();
const mockJsonResponse = vi.fn();
const mockNext = vi.fn();

// Mock NextResponse
vi.mock('next/server', () => {
  return {
    NextRequest: vi.fn(),
    NextResponse: {
      json: (...args: unknown[]) => {
        mockJsonResponse(...args);
        return { type: 'json', args };
      },
      redirect: (...args: unknown[]) => {
        mockRedirect(...args);
        return { type: 'redirect', args };
      },
      next: (...args: unknown[]) => {
        mockNext(...args);
        return { type: 'next', args };
      },
    },
  };
});

// Import after mocking
import { middleware, config } from '@/middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/** Helper to create a valid JWT token */
function createValidToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

/** Helper to create an expired JWT token */
function createExpiredToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '-1s' });
}

/** Helper to create a mock NextRequest */
function createMockRequest(pathname: string, token?: string) {
  const url = `http://localhost:3000${pathname}`;
  return {
    nextUrl: { pathname },
    url,
    cookies: {
      get: (name: string) => {
        if (name === 'auth_token' && token) {
          return { value: token };
        }
        return undefined;
      },
    },
    headers: new Headers(),
  } as unknown as Parameters<typeof middleware>[0];
}

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('matcher config', () => {
    it('should have a matcher pattern defined', () => {
      expect(config.matcher).toBeDefined();
      expect(config.matcher.length).toBeGreaterThan(0);
    });

    it('should exclude login page, login API, and health endpoint from matching', () => {
      const pattern = config.matcher[0];
      // The negative lookahead pattern should exclude these paths
      expect(pattern).toContain('login');
      expect(pattern).toContain('api/auth/login');
      expect(pattern).toContain('api/health');
    });

    it('should exclude Next.js static files', () => {
      const pattern = config.matcher[0];
      expect(pattern).toContain('_next/static');
      expect(pattern).toContain('_next/image');
      expect(pattern).toContain('favicon');
    });
  });

  describe('API routes without token', () => {
    it('should return 401 JSON for unauthenticated API requests', async () => {
      const request = createMockRequest('/api/exercises');

      await middleware(request);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 for /api/sessions without token', async () => {
      const request = createMockRequest('/api/sessions');

      await middleware(request);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 for /api/auth/me without token', async () => {
      const request = createMockRequest('/api/auth/me');

      await middleware(request);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });
  });

  describe('Page routes without token', () => {
    it('should redirect to /login for unauthenticated page requests', async () => {
      const request = createMockRequest('/');

      await middleware(request);

      expect(mockRedirect).toHaveBeenCalled();
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(redirectUrl.pathname).toBe('/login');
    });

    it('should redirect to /login for /history without token', async () => {
      const request = createMockRequest('/history');

      await middleware(request);

      expect(mockRedirect).toHaveBeenCalled();
      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(redirectUrl.pathname).toBe('/login');
    });
  });

  describe('Authenticated requests with valid token', () => {
    it('should pass through with x-user-id header for valid API token', async () => {
      const token = createValidToken('user-123');
      const request = createMockRequest('/api/exercises', token);

      await middleware(request);

      expect(mockNext).toHaveBeenCalled();
      const nextArgs = mockNext.mock.calls[0][0];
      const headers = nextArgs.request.headers;
      expect(headers.get('x-user-id')).toBe('user-123');
    });

    it('should pass through with x-user-id header for valid page token', async () => {
      const token = createValidToken('user-456');
      const request = createMockRequest('/', token);

      await middleware(request);

      expect(mockNext).toHaveBeenCalled();
      const nextArgs = mockNext.mock.calls[0][0];
      const headers = nextArgs.request.headers;
      expect(headers.get('x-user-id')).toBe('user-456');
    });
  });

  describe('Invalid tokens', () => {
    it('should return 401 for expired token on API route', async () => {
      const token = createExpiredToken('user-expired');
      const request = createMockRequest('/api/exercises', token);

      await middleware(request);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should redirect for expired token on page route', async () => {
      const token = createExpiredToken('user-expired');
      const request = createMockRequest('/', token);

      await middleware(request);

      expect(mockRedirect).toHaveBeenCalled();
    });

    it('should return 401 for malformed token on API route', async () => {
      const request = createMockRequest('/api/exercises', 'not-a-valid-jwt');

      await middleware(request);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 for token signed with wrong secret', async () => {
      const token = jwt.sign({ userId: 'user-wrong' }, 'wrong-secret', { expiresIn: '30d' });
      const request = createMockRequest('/api/exercises', token);

      await middleware(request);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });

    it('should return 401 for token without userId field', async () => {
      const token = jwt.sign({ sub: 'user-no-userid' }, JWT_SECRET, { expiresIn: '30d' });
      const request = createMockRequest('/api/exercises', token);

      await middleware(request);

      expect(mockJsonResponse).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    });
  });
});
