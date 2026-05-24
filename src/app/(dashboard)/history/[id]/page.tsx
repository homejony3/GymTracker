'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { formatDate } from '@/services/format.service';

const ComparisonView = dynamic(() => import('@/components/ComparisonView'), {
  ssr: false,
  loading: () => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
      <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
      <div className="h-16 bg-gray-100 rounded" />
    </div>
  ),
});
import type { WorkoutSplit } from '@/types';

/**
 * Shape of a workout set from the API.
 */
interface SetItem {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  createdAt: string;
}

/**
 * Shape of the session detail from the API.
 */
interface SessionDetail {
  id: string;
  userId: string;
  split: WorkoutSplit;
  sessionDate: string;
  completed: boolean;
  createdAt: string;
  sets: SetItem[];
}

/**
 * Prior sets keyed by exerciseId.
 */
interface PriorSetsMap {
  [exerciseId: string]: {
    sets: SetItem[] | null;
    loading: boolean;
  };
}

/**
 * Exercise name map keyed by exerciseId.
 */
interface ExerciseNameMap {
  [exerciseId: string]: string;
}

/**
 * Session detail page — displays the complete session log with comparison view.
 * Fetches from GET /api/sessions/[id] to get full session with all sets.
 * Groups sets by exercise and shows ComparisonView for each.
 * Fetches prior session data for each exercise for comparison.
 *
 * Requirements: 5.2, 5.3, 5.4, 8.1
 */
export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priorSetsMap, setPriorSetsMap] = useState<PriorSetsMap>({});
  const [exerciseNames, setExerciseNames] = useState<ExerciseNameMap>({});

  const fetchSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Session not found');
        }
        throw new Error('Failed to fetch session');
      }

      const data = await response.json();
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Once session is loaded, fetch exercise names and prior sets for each exercise
  useEffect(() => {
    if (!session) return;

    const exerciseIds = Array.from(new Set(session.sets.map((s) => s.exerciseId)));

    // Fetch exercise names
    async function fetchExerciseNames() {
      try {
        const response = await fetch(`/api/exercises?split=${session!.split}`);
        if (response.ok) {
          const data = await response.json();
          const nameMap: ExerciseNameMap = {};
          for (const exercise of data.exercises) {
            nameMap[exercise.id] = exercise.name;
          }
          setExerciseNames(nameMap);
        }
      } catch {
        // Silently fail — names will show as "Unknown Exercise"
      }
    }

    // Fetch prior sets for each exercise
    async function fetchPriorSets() {
      // Initialize loading state for all exercises
      const initialMap: PriorSetsMap = {};
      for (const exerciseId of exerciseIds) {
        initialMap[exerciseId] = { sets: null, loading: true };
      }
      setPriorSetsMap(initialMap);

      // Fetch in parallel
      await Promise.all(
        exerciseIds.map(async (exerciseId) => {
          try {
            const response = await fetch(
              `/api/sessions/${sessionId}/comparison/${exerciseId}`
            );
            if (response.ok) {
              const data = await response.json();
              setPriorSetsMap((prev) => ({
                ...prev,
                [exerciseId]: { sets: data.priorSets, loading: false },
              }));
            } else {
              setPriorSetsMap((prev) => ({
                ...prev,
                [exerciseId]: { sets: null, loading: false },
              }));
            }
          } catch {
            setPriorSetsMap((prev) => ({
              ...prev,
              [exerciseId]: { sets: null, loading: false },
            }));
          }
        })
      );
    }

    fetchExerciseNames();
    fetchPriorSets();
  }, [session, sessionId]);

  // Group sets by exerciseId
  function groupSetsByExercise(sets: SetItem[]): Map<string, SetItem[]> {
    const grouped = new Map<string, SetItem[]>();
    for (const set of sets) {
      const existing = grouped.get(set.exerciseId) || [];
      existing.push(set);
      grouped.set(set.exerciseId, existing);
    }
    return grouped;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-500">Loading session…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchSession}
          className="min-h-touch px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const groupedSets = groupSetsByExercise(session.sets);
  const formattedDate = formatDate(new Date(session.sessionDate));

  return (
    <div className="flex flex-col gap-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/history')}
          className="min-h-touch min-w-touch flex items-center justify-center rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          aria-label="Back to history"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-gray-900">
            {formattedDate}
          </h2>
          <span className="text-xs text-gray-500">{session.split}</span>
        </div>
      </div>

      {/* Exercise groups with comparison */}
      {session.sets.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-sm text-gray-500">No sets recorded in this session</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(groupedSets.entries()).map(([exerciseId, sets]) => {
            const prior = priorSetsMap[exerciseId];
            const exerciseName =
              exerciseNames[exerciseId] || 'Unknown Exercise';

            return (
              <ComparisonView
                key={exerciseId}
                exerciseName={exerciseName}
                currentSets={sets.map((s) => ({
                  setNumber: s.setNumber,
                  weightKg: s.weightKg,
                  reps: s.reps,
                }))}
                priorSets={
                  prior?.sets
                    ? prior.sets.map((s) => ({
                        setNumber: s.setNumber,
                        weightKg: s.weightKg,
                        reps: s.reps,
                      }))
                    : null
                }
                loading={prior?.loading ?? true}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
