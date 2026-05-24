'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { WorkoutSplit } from '@/types';

const HistoryView = dynamic(() => import('@/components/HistoryView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-2 animate-pulse">
      <div className="h-16 bg-gray-200 rounded-lg" />
      <div className="h-16 bg-gray-200 rounded-lg" />
      <div className="h-16 bg-gray-200 rounded-lg" />
    </div>
  ),
});

const PAGE_SIZE = 50;

/**
 * Session item shape from the API response.
 */
interface SessionItem {
  id: string;
  sessionDate: string;
  split: WorkoutSplit;
  setCount: number;
}

/**
 * Inner component that uses useSearchParams (must be wrapped in Suspense).
 */
function HistoryPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const pageParam = searchParams.get('page');
  const splitParam = searchParams.get('split') as WorkoutSplit | null;

  const currentPage = pageParam ? parseInt(pageParam, 10) : 1;
  const currentSplit = splitParam && ['UPPER', 'LOWER', 'ARMS'].includes(splitParam)
    ? splitParam
    : undefined;

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      if (currentSplit) {
        params.set('split', currentSplit);
      }

      const response = await fetch(`/api/sessions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const data = await response.json();
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentSplit]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/history?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-500">Loading sessions…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchSessions}
          className="min-h-touch px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900">Session History</h2>
      <HistoryView
        sessions={sessions}
        page={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

/**
 * History page — displays paginated session history.
 * Fetches from GET /api/sessions with page and optional split query params.
 *
 * Requirements: 5.1, 5.6, 5.7, 8.2
 */
export default function HistoryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-500">Loading sessions…</p>
      </div>
    }>
      <HistoryPageContent />
    </Suspense>
  );
}
