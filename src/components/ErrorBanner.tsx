'use client';

import { useState, useCallback, createContext, useContext } from 'react';

/**
 * Persistent error banner for when all retries are exhausted.
 * Shows "Data was not saved" message with a manual Retry button.
 * Stays visible until dismissed or retry succeeds.
 *
 * Validates: Requirements 10.5
 */

interface ErrorBannerState {
  visible: boolean;
  message: string;
  retryFn: (() => Promise<void>) | null;
}

interface ErrorBannerContextValue {
  /** Show the error banner with a retry function */
  showError: (message: string, retryFn?: () => Promise<void>) => void;
  /** Hide the error banner */
  hideError: () => void;
}

const ErrorBannerContext = createContext<ErrorBannerContextValue | null>(null);

/**
 * Hook to access the error banner system.
 * Must be used within an ErrorBannerProvider.
 */
export function useErrorBanner(): ErrorBannerContextValue {
  const context = useContext(ErrorBannerContext);
  if (!context) {
    throw new Error('useErrorBanner must be used within an ErrorBannerProvider');
  }
  return context;
}

/**
 * Error banner provider that manages persistent error state.
 * Wrap your app layout with this provider.
 */
export function ErrorBannerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ErrorBannerState>({
    visible: false,
    message: '',
    retryFn: null,
  });
  const [retrying, setRetrying] = useState(false);

  const showError = useCallback(
    (message: string, retryFn?: () => Promise<void>) => {
      setState({
        visible: true,
        message,
        retryFn: retryFn || null,
      });
    },
    []
  );

  const hideError = useCallback(() => {
    setState({ visible: false, message: '', retryFn: null });
  }, []);

  const handleRetry = async () => {
    if (!state.retryFn) return;

    setRetrying(true);
    try {
      await state.retryFn();
      // If retry succeeds, hide the banner
      hideError();
    } catch {
      // Retry failed — banner stays visible
    } finally {
      setRetrying(false);
    }
  };

  return (
    <ErrorBannerContext.Provider value={{ showError, hideError }}>
      {children}
      {state.visible && (
        <div
          className="fixed top-0 left-0 right-0 z-50 bg-red-700 text-white px-4 py-3 shadow-md"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center justify-between gap-3 max-w-screen-sm mx-auto">
            <div className="flex-1">
              <p className="text-sm font-medium">{state.message}</p>
            </div>
            <div className="flex items-center gap-2">
              {state.retryFn && (
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-sm font-semibold bg-white text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Retry saving data"
                >
                  {retrying ? 'Retrying…' : 'Retry'}
                </button>
              )}
              <button
                onClick={hideError}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/80 hover:text-white"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBannerContext.Provider>
  );
}
