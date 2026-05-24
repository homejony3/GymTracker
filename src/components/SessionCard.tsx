'use client';

import Link from 'next/link';
import { formatDate } from '@/services/format.service';
import type { WorkoutSplit } from '@/types';

/**
 * Props for SessionCard component.
 */
interface SessionCardProps {
  id: string;
  sessionDate: string;
  split: WorkoutSplit;
  setCount: number;
}

/**
 * SessionCard — displays a single session summary in the history list.
 * Shows date (DD.MM.YYYY), split name, total set count, and links to detail view.
 *
 * Requirements: 5.1, 5.6, 7.2 (44px touch target), 8.2 (EU date format)
 */
export default function SessionCard({ id, sessionDate, split, setCount }: SessionCardProps) {
  const date = new Date(sessionDate);
  const formattedDate = formatDate(date);

  return (
    <Link
      href={`/history/${id}`}
      className="block min-h-touch p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-colors"
      aria-label={`Session on ${formattedDate}, ${split} split, ${setCount} sets`}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-900">{formattedDate}</span>
          <span className="text-xs text-gray-500">{split}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {setCount} {setCount === 1 ? 'set' : 'sets'}
          </span>
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
