'use client';

import { formatWeight } from '@/services/format.service';

/**
 * A single set's data for display.
 */
interface SetData {
  setNumber: number;
  weightKg: number;
  reps: number;
}

/**
 * Props for ComparisonView component.
 */
interface ComparisonViewProps {
  exerciseName: string;
  currentSets: SetData[];
  priorSets: SetData[] | null;
  loading?: boolean;
}

/**
 * ComparisonView — side-by-side display of current session sets vs previous session sets.
 * Shows weight × reps for each set in both columns.
 * Displays "No prior data" indicator when no comparison is available.
 * All weights displayed in EU format (comma decimal, "kg" suffix).
 *
 * Requirements: 5.3, 5.4, 8.1
 */
export default function ComparisonView({
  exerciseName,
  currentSets,
  priorSets,
  loading = false,
}: ComparisonViewProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{exerciseName}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Current session sets */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Current
          </p>
          <div className="flex flex-col gap-1">
            {currentSets.map((set) => (
              <div
                key={set.setNumber}
                className="flex items-center gap-2 text-sm text-gray-800"
              >
                <span className="text-xs text-gray-400 w-6">#{set.setNumber}</span>
                <span className="font-medium">{formatWeight(set.weightKg)}</span>
                <span className="text-gray-500">×</span>
                <span>{set.reps} reps</span>
              </div>
            ))}
          </div>
        </div>

        {/* Previous session sets */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Previous
          </p>
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : priorSets === null || priorSets.length === 0 ? (
            <div className="flex items-center gap-2 py-1">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-300" aria-hidden="true" />
              <span className="text-sm text-gray-400 italic">No prior data</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {priorSets.map((set) => (
                <div
                  key={set.setNumber}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <span className="text-xs text-gray-400 w-6">#{set.setNumber}</span>
                  <span className="font-medium">{formatWeight(set.weightKg)}</span>
                  <span className="text-gray-400">×</span>
                  <span>{set.reps} reps</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
