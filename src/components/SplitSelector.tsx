'use client';

import { WorkoutSplit, WORKOUT_SPLITS } from '@/types';

/**
 * Tab-style navigation for selecting UPPER/LOWER/ARMS splits.
 * Reusable across exercise list and session pages.
 *
 * Requirements: 2.1 (three predefined splits), 7.1 (320px viewport), 7.5 (no horizontal scroll)
 */
interface SplitSelectorProps {
  /** Currently active split */
  activeSplit: WorkoutSplit;
  /** Callback when a split tab is selected */
  onSplitChange: (split: WorkoutSplit) => void;
}

export default function SplitSelector({ activeSplit, onSplitChange }: SplitSelectorProps) {
  return (
    <nav
      className="flex w-full bg-white border-b border-gray-200"
      aria-label="Workout split selector"
    >
      {WORKOUT_SPLITS.map((split) => {
        const isActive = split === activeSplit;
        return (
          <button
            key={split}
            onClick={() => onSplitChange(split)}
            aria-current={isActive ? 'page' : undefined}
            className={`
              flex-1 min-h-touch px-2 py-3 text-sm font-medium text-center transition-colors
              ${isActive
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            {split}
          </button>
        );
      })}
    </nav>
  );
}
