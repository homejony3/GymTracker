import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from '@/lib/api-client';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = { href: '' };
Object.defineProperty(global, 'window', {
  value: { location: mockLocation },
  writable: true,
});

describe('apiClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockLocation.href = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful requests', () => {
    it('returns response on 200 OK', async () => {
      const mockResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
      });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiClient('/api/test');

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('passes fetch options through to fetch', async () => {
      const mockResponse = new Response('', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await apiClient('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      });
    });
  });

  describe('401 handling', () => {
    it('redirects to /login on 401 response', async () => {
      const mockResponse = new Response('', { status: 401 });
      mockFetch.mockResolvedValue(mockResponse);

      await expect(apiClient('/api/test')).rejects.toThrow('Session expired');
      expect(mockLocation.href).toBe('/login');
    });

    it('does not retry on 401', async () => {
      const mockResponse = new Response('', { status: 401 });
      mockFetch.mockResolvedValue(mockResponse);

      await expect(apiClient('/api/test')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('4xx client errors (non-401)', () => {
    it('returns response on 400 without retrying', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'Bad request' }),
        { status: 400 }
      );
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiClient('/api/test');

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns response on 404 without retrying', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404 }
      );
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiClient('/api/test');

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns response on 409 without retrying', async () => {
      const mockResponse = new Response(
        JSON.stringify({ error: 'Conflict' }),
        { status: 409 }
      );
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiClient('/api/test');

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('5xx server errors with retry', () => {
    it('retries on 500 and succeeds on second attempt', async () => {
      const failResponse = new Response('', { status: 500 });
      const successResponse = new Response('', { status: 200 });
      mockFetch
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      const promise = apiClient('/api/test', { retryDelayMs: 2000 });

      // First attempt fails
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result).toBe(successResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after 3 failed attempts on 5xx', async () => {
      const failResponse = new Response('', { status: 500 });
      mockFetch.mockResolvedValue(failResponse);

      const promise = apiClient('/api/test', { retryDelayMs: 100 });

      // Run all timers to completion and await the rejection
      const [error] = await Promise.all([
        promise.catch((e: Error) => e),
        vi.runAllTimersAsync(),
      ]);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('Server error: 500');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('calls onTransientError callback during retries', async () => {
      const failResponse = new Response('', { status: 500 });
      const successResponse = new Response('', { status: 200 });
      mockFetch
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      const onTransientError = vi.fn();

      const promise = apiClient('/api/test', {
        retryDelayMs: 100,
        onTransientError,
      });

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(onTransientError).toHaveBeenCalledTimes(1);
      expect(onTransientError).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        3
      );
    });

    it('calls onRetriesExhausted when all retries fail', async () => {
      const failResponse = new Response('', { status: 500 });
      mockFetch.mockResolvedValue(failResponse);

      const onRetriesExhausted = vi.fn();

      const promise = apiClient('/api/test', {
        retryDelayMs: 100,
        onRetriesExhausted,
      });

      // Run all timers to completion and await the rejection
      await Promise.all([
        promise.catch(() => {}),
        vi.runAllTimersAsync(),
      ]);

      expect(onRetriesExhausted).toHaveBeenCalledTimes(1);
    });
  });

  describe('network errors with retry', () => {
    it('retries on network error and succeeds', async () => {
      const networkError = new TypeError('Failed to fetch');
      const successResponse = new Response('', { status: 200 });
      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse);

      const promise = apiClient('/api/test', { retryDelayMs: 100 });

      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe(successResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws ApiError after all network retries exhausted', async () => {
      const networkError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValue(networkError);

      const promise = apiClient('/api/test', { retryDelayMs: 100 });

      // Run all timers to completion and await the rejection
      const [error] = await Promise.all([
        promise.catch((e: Error) => e),
        vi.runAllTimersAsync(),
      ]);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('Network error: all retries exhausted');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('custom retry configuration', () => {
    it('respects custom maxRetries', async () => {
      const failResponse = new Response('', { status: 500 });
      mockFetch.mockResolvedValue(failResponse);

      const promise = apiClient('/api/test', {
        maxRetries: 5,
        retryDelayMs: 100,
      });

      // Run all timers to completion and await the rejection
      const [error] = await Promise.all([
        promise.catch((e: Error) => e),
        vi.runAllTimersAsync(),
      ]);

      expect(error).toBeInstanceOf(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('uses 2s retry delay by default', async () => {
      const failResponse = new Response('', { status: 500 });
      const successResponse = new Response('', { status: 200 });
      mockFetch
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(successResponse);

      const promise = apiClient('/api/test');

      // Should not have retried yet at 1.9s
      await vi.advanceTimersByTimeAsync(1900);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should retry at 2s
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;
      expect(result).toBe(successResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ApiError', () => {
  it('has correct name and status', () => {
    const error = new ApiError('test error', 500);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(500);
    expect(error.message).toBe('test error');
  });

  it('stores cause error', () => {
    const cause = new Error('original');
    const error = new ApiError('wrapped', 0, cause);
    expect(error.cause).toBe(cause);
  });
});
