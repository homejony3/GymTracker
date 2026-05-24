/**
 * Transient database error codes/messages that warrant a retry.
 */
const TRANSIENT_ERROR_PATTERNS = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'connection reset',
  'connection timeout',
  'timeout expired',
  'Connection terminated unexpectedly',
];

/**
 * Determines whether an error is a transient database error
 * that should be retried.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const code = (error as NodeJS.ErrnoException).code?.toUpperCase() ?? '';

    return TRANSIENT_ERROR_PATTERNS.some(
      (pattern) =>
        message.includes(pattern.toLowerCase()) ||
        code.includes(pattern.toUpperCase())
    );
  }
  return false;
}

/**
 * Retries an async operation up to `maxRetries` times with a delay between attempts.
 * Only retries on transient database errors by default, unless a custom
 * `shouldRetry` predicate is provided.
 *
 * @param operation - The async operation to execute
 * @param maxRetries - Maximum number of attempts (default: 3)
 * @param delayMs - Milliseconds to wait between retries (default: 2000)
 * @param shouldRetry - Optional predicate to determine if an error is retryable
 * @returns The result of the operation
 * @throws The last error encountered after all retries are exhausted
 *
 * Validates: Requirements 10.3, 10.5
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 2000,
  shouldRetry: (error: unknown) => boolean = isTransientError
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // This line should never be reached since the loop always either
  // returns or throws, but TypeScript needs it for type safety.
  throw new Error('Unreachable: all retry attempts exhausted');
}
