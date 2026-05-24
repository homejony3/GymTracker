'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * App header with title and logout button.
 * POSTs to /api/auth/logout then redirects to /login.
 *
 * Requirements: 1.5 (redirect on logout), 7.1 (320px viewport)
 */
export default function Header() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  }

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
      <h1 className="text-lg font-semibold text-gray-900">Gym Tracker</h1>
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label="Log out"
        className="min-h-touch min-w-touch px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
      >
        {loggingOut ? 'Logging out…' : 'Logout'}
      </button>
    </header>
  );
}
