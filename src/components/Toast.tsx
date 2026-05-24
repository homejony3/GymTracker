'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

/**
 * Toast notification system for transient errors.
 * Shows temporary error messages that auto-dismiss after 5 seconds.
 * Positioned at the bottom of the screen for mobile accessibility.
 *
 * Validates: Requirements 10.3
 */

interface ToastMessage {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info';
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastMessage['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access the toast notification system.
 * Must be used within a ToastProvider.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Toast provider that manages toast state and renders notifications.
 * Wrap your app layout with this provider.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastMessage['type'] = 'error') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/**
 * Container that renders active toast notifications.
 */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/**
 * Individual toast notification with auto-dismiss after 5 seconds.
 */
function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bgColor =
    toast.type === 'error'
      ? 'bg-red-600'
      : toast.type === 'warning'
        ? 'bg-yellow-600'
        : 'bg-blue-600';

  return (
    <div
      className={`${bgColor} text-white text-sm px-4 py-3 rounded-md shadow-lg pointer-events-auto flex items-center justify-between gap-2 animate-slide-up`}
      role="alert"
    >
      <span>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-white/80 hover:text-white"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
