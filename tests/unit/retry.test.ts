import { describe, it, expect, vi } from 'vitest';
import { withRetry, isTransientError } from '@/lib/retry';

describe('isTransientError', () => {
  it('returns true for ECONNRESET errors', () => {
    const error = new Error('read ECONNRESET');
    expect(isTransientError(error)).toBe(true);
  });

  it('returns true for ECONNREFUSED errors', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    expect(isTransientError(error)).toBe(true);
  });

  it('returns true for ETIMEDOUT errors', () => {
    const error = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });
    expect(isTransientError(error)).toBe(true);
  });

  it('returns true for connection timeout messages', () => {
    const error = new Error('connection timeout');
    expect(isTransientError(error)).toBe(true);
  });

  it('returns true for connection terminated unexpectedly', () => {
    const error = new Error('Connection terminated unexpectedly');
    expect(isTransientError(error)).toBe(true);
  });

  it('returns false for non-transient errors', () => {
    const error = new Error('syntax error at position 42');
    expect(isTransientError(error)).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientError('some string')).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns immediately on successful operation', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withRetry(operation, 3, 0);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on transient errors and succeeds', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue('success');

    const result = await withRetry(operation, 3, 0);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries exhausted', async () => {
    const error = new Error('read ECONNRESET');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(withRetry(operation, 3, 0)).rejects.toThrow('read ECONNRESET');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient errors', async () => {
    const error = new Error('syntax error in SQL');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(withRetry(operation, 3, 0)).rejects.toThrow(
      'syntax error in SQL'
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('uses custom shouldRetry predicate', async () => {
    const customError = new Error('custom retryable error');
    const operation = vi
      .fn()
      .mockRejectedValueOnce(customError)
      .mockResolvedValue('recovered');

    const shouldRetry = (err: unknown) =>
      err instanceof Error && err.message.includes('custom retryable');

    const result = await withRetry(operation, 3, 0, shouldRetry);

    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('waits the specified delay between retries', async () => {
    vi.useFakeTimers();

    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockResolvedValue('success');

    const promise = withRetry(operation, 3, 2000);

    // First call happens immediately
    expect(operation).toHaveBeenCalledTimes(1);

    // Advance time by the delay
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('defaults to 3 max retries', async () => {
    const error = new Error('ECONNRESET');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(withRetry(operation, undefined, 0)).rejects.toThrow(
      'ECONNRESET'
    );
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
