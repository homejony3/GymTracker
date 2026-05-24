/**
 * Client-side fetch wrapper with retry logic, error handling,
 * and 401 redirect support.
 *
 * Drop-in replacement for fetch in client components.
 *
 * Validates: Requirements 10.3, 10.5, 1.6
 */

export interface ApiClientOptions extends RequestInit {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 2000) */
  retryDelayMs?: number;
  /** Callback fired on each transient error during retry */
  onTransientError?: (error: Error, attempt: number, maxRetries: number) => void;
  /** Callback fired when all retries are exhausted */
  onRetriesExhausted?: (error: Error) => void;
}

/**
 * Determines if a response status code is retryable.
 * Only 5xx server errors are retried; 4xx client errors are not.
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

/**
 * Determines if an error is a network error (fetch failed entirely).
 */
function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Network request failed'))
  );
}

/**
 * Fetch wrapper with automatic retry logic.
 *
 * - Retries on network errors and 5xx responses up to 3 times with 2s intervals
 * - Does NOT retry on 4xx responses
 * - On 401: redirects to /login (session expired)
 * - Returns the Response on success
 * - Throws an ApiError after all retries are exhausted
 *
 * @param url - The URL to fetch
 * @param options - Fetch options extended with retry configuration
 * @returns The fetch Response on success
 * @throws ApiError when all retries are exhausted or a non-retryable error occurs
 */
export async function apiClient(
  url: string,
  options: ApiClientOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    retryDelayMs = 2000,
    onTransientError,
    onRetriesExhausted,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 — session expired, redirect to login
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new ApiError('Session expired', 401);
      }

      // Non-retryable client errors (4xx except 401 already handled)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retryable server errors (5xx)
      if (isRetryableStatus(response.status)) {
        lastError = new ApiError(
          `Server error: ${response.status}`,
          response.status
        );

        if (attempt < maxRetries) {
          onTransientError?.(lastError, attempt, maxRetries);
          await delay(retryDelayMs);
          continue;
        }

        // All retries exhausted
        onRetriesExhausted?.(lastError);
        throw lastError;
      }

      // Success (2xx, 3xx)
      return response;
    } catch (error) {
      // Re-throw ApiError for 401 (already handled above)
      if (error instanceof ApiError && error.status === 401) {
        throw error;
      }

      // Network errors are retryable
      if (isNetworkError(error) || error instanceof TypeError) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          onTransientError?.(lastError, attempt, maxRetries);
          await delay(retryDelayMs);
          continue;
        }

        // All retries exhausted
        onRetriesExhausted?.(lastError);
        throw new ApiError(
          'Network error: all retries exhausted',
          0,
          lastError
        );
      }

      // Non-retryable errors (including ApiError from 5xx exhaustion)
      if (error instanceof ApiError) {
        throw error;
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Unexpected: all retry attempts exhausted');
}

/**
 * Custom error class for API client errors.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly cause?: Error;

  constructor(message: string, status: number, cause?: Error) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.cause = cause;
  }
}

/**
 * Promise-based delay utility.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
