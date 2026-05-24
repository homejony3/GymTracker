'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatWeight } from '@/services/format.service';
import type { WeightSuggestion as WeightSuggestionType } from '@/types';

/**
 * WeightSuggestion — displays the progressive overload weight suggestion
 * for a given exercise. Fetches from GET /api/suggestions/[exerciseId]
 * and shows increase/maintain/no_history indicators.
 *
 * Requirements: 6.1, 6.3, 6.4, 6.5, 6.6
 */
interface WeightSuggestionProps {
  /** The exercise ID to fetch a suggestion for */
  exerciseId: string;
  /** Called when the user accepts the suggestion — fills the weight input */
  onUseSuggestion: (weightKg: number) => void;
}

export default function WeightSuggestion({
  exerciseId,
  onUseSuggestion,
}: WeightSuggestionProps) {
  const [suggestion, setSuggestion] = useState<WeightSuggestionType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestion = useCallback(async () => {
    if (!exerciseId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/suggestions/${exerciseId}`);

      if (!response.ok) {
        setError('Failed to load suggestion');
        return;
      }

      const data: WeightSuggestionType = await response.json();
      setSuggestion(data);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    fetchSuggestion();
  }, [fetchSuggestion]);

  // Loading state
  if (loading) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200 animate-pulse"
        aria-label="Loading weight suggestion"
        role="status"
      >
        <div className="h-4 w-4 rounded-full bg-gray-300" />
        <div className="h-4 w-24 rounded bg-gray-300" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-md border border-red-200 text-sm text-red-600"
        role="alert"
      >
        <span>{error}</span>
        <button
          type="button"
          onClick={fetchSuggestion}
          className="min-h-touch min-w-touch ml-auto text-red-700 underline text-sm"
          aria-label="Retry loading suggestion"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!suggestion) return null;

  // No history — user needs to enter a starting weight
  if (suggestion.reasoning === 'no_history') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200 text-sm text-gray-600"
        aria-label="No prior data available"
      >
        <span className="text-gray-400" aria-hidden="true">—</span>
        <span>No prior data — enter a starting weight</span>
      </div>
    );
  }

  // Increase suggestion
  if (suggestion.reasoning === 'increase' && suggestion.suggestedWeightKg !== null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-md border border-green-200">
        <div className="flex-1 flex items-center gap-2 text-sm text-green-800">
          <span aria-hidden="true" className="text-green-600 font-bold">↑</span>
          <span>
            Increase to {formatWeight(suggestion.suggestedWeightKg)}
          </span>
          <span className="text-green-600 text-xs font-medium">
            +{formatWeight(suggestion.incrementKg).replace(' kg', '')}&nbsp;kg
          </span>
        </div>
        <button
          type="button"
          onClick={() => onUseSuggestion(suggestion.suggestedWeightKg!)}
          className="min-h-touch px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
          aria-label={`Use suggested weight ${formatWeight(suggestion.suggestedWeightKg)}`}
        >
          Use suggestion
        </button>
      </div>
    );
  }

  // Maintain suggestion
  if (suggestion.reasoning === 'maintain' && suggestion.suggestedWeightKg !== null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-md border border-blue-200">
        <div className="flex-1 flex items-center gap-2 text-sm text-blue-800">
          <span aria-hidden="true" className="text-blue-600 font-bold">→</span>
          <span>
            Maintain at {formatWeight(suggestion.suggestedWeightKg)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onUseSuggestion(suggestion.suggestedWeightKg!)}
          className="min-h-touch px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          aria-label={`Use suggested weight ${formatWeight(suggestion.suggestedWeightKg)}`}
        >
          Use suggestion
        </button>
      </div>
    );
  }

  return null;
}
