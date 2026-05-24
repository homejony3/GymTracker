import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth service
vi.mock('@/services/auth.service', () => ({
  authenticate: vi.fn(),
}));

// Mock db pool
vi.mock('@/lib/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { authenticate } from '@/services/auth.service';
import { pool } from '@/lib/db';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import { GET as meHandler } from '@/app/api/auth/me/route';

const mockAuthenticate = authenticate as ReturnType<typeof vi.fn>;
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

function createRequest(method: string, body?: unknown, headers?: Record<string, string>): NextRequest {
  const url = 'http://localhost:3000/api/auth/login';
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for missing request body', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{',
    });

    const response = await loginHandler(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid request body');
  });

  it('should return 400 when username is missing', async () => {
    const request = createRequest('POST', { password: 'test123' });
    const response = await loginHandler(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Username and password are required');
  });

  it('should return 400 when password is missing', async () => {
    const request = createRequest('POST', { username: 'testuser' });
    const response = await loginHandler(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Username and password are required');
  });

  it('should return 400 when username is not a string', async () => {
    const request = createRequest('POST', { username: 123, password: 'test' });
    const response = await loginHandler(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 when username is empty/whitespace', async () => {
    const request = createRequest('POST', { username: '   ', password: 'test123' });
    const response = await loginHandler(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Username and password are required');
  });

  it('should return 400 when password is empty', async () => {
    const request = createRequest('POST', { username: 'testuser', password: '' });
    const response = await loginHandler(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Username and password are required');
  });

  it('should return 401 on invalid credentials', async () => {
    mockAuthenticate.mockResolvedValueOnce({ error: 'Invalid credentials' });

    const request = createRequest('POST', { username: 'testuser', password: 'wrong' });
    const response = await loginHandler(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Invalid credentials');
  });

  it('should return 429 with Retry-After header on lockout', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      error: 'Account locked for 15 minutes',
      locked: true,
    });

    const request = createRequest('POST', { username: 'testuser', password: 'wrong' });
    const response = await loginHandler(request);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('900');
    const data = await response.json();
    expect(data.error).toBe('Account locked for 15 minutes');
  });

  it('should return 200 with user info and set auth_token cookie on success', async () => {
    const mockUser = {
      id: 'user-uuid-1',
      username: 'testuser',
      createdAt: new Date('2024-01-01'),
    };
    mockAuthenticate.mockResolvedValueOnce({
      token: 'jwt-token-123',
      user: mockUser,
    });

    const request = createRequest('POST', { username: 'testuser', password: 'correct' });
    const response = await loginHandler(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.user.id).toBe('user-uuid-1');
    expect(data.user.username).toBe('testuser');

    // Check cookie is set
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('auth_token=jwt-token-123');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie?.toLowerCase()).toContain('samesite=lax');
  });
});

describe('POST /api/auth/logout', () => {
  it('should return 200 and clear the auth_token cookie', async () => {
    const response = await logoutHandler();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    // Check cookie is cleared (maxAge=0)
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('auth_token=');
    expect(setCookie).toContain('Max-Age=0');
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when x-user-id header is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/me', {
      method: 'GET',
    });

    const response = await meHandler(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 404 when user is not found in database', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = new NextRequest('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: { 'x-user-id': 'nonexistent-id' },
    });

    const response = await meHandler(request);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('User not found');
  });

  it('should return user info when x-user-id header is present and user exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'user-uuid-1',
        username: 'testuser',
        created_at: new Date('2024-01-01'),
      }],
    });

    const request = new NextRequest('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: { 'x-user-id': 'user-uuid-1' },
    });

    const response = await meHandler(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.id).toBe('user-uuid-1');
    expect(data.user.username).toBe('testuser');
  });
});
