'use client';

import SessionCard from '@/components/SessionCard';
import type { WorkoutSplit } from '@/types';

/**
 * A session item as returned from the API.
 */
interface SessionItem {
  id: string;
  sessionDate: string;
  split: WorkoutSplit;
  setCount: number;
}

/**
 * Props for HistoryView component.
 */
interface HistoryViewProps {
  sessions: SessionItem[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * HistoryView — renders a paginated list of SessionCard components.
 * Shows empty state when no sessions exist.
 * Provides Previous/Next pagination buttons with 44px touch targets.
 *
 * Requirements: 5.1, 5.7, 7.2 (44px touch targets)
 */
export default function HistoryView({ sessions, page, totalPages, onPageChange }: HistoryViewProps) {
  if (sessions.length === 0 && page === 1) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-gray-500 text-sm">No sessions have been recorded</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            id={session.id}
            sessionDate={session.sessionDate}
            split={session.split}
            setCount={session.setCount}
          />
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="min-h-touch min-w-touch px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            Previous
          </button>

          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="min-h-touch min-w-touch px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
