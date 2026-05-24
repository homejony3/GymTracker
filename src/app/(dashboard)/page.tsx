'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import ExerciseList from '@/components/ExerciseList';
import { WorkoutSplit } from '@/types';

/**
 * Main dashboard page showing exercises for the selected split.
 * Reads the `split` search param from the URL (set by the layout's SplitSelector).
 * Fetches exercises from GET /api/exercises?split=UPPER|LOWER|ARMS.
 *
 * Requirements: 2.2, 2.6
 */

interface ExerciseData {
  id: string;
  name: string;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const split = (searchParams.get('split') as WorkoutSplit) || 'UPPER';

  const [exercises, setExercises] = useState<ExerciseData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/exercises?split=${split}`);
      if (response.ok) {
        const data = await response.json();
        setExercises(data.exercises ?? []);
      } else {
        setExercises([]);
      }
    } catch {
      setExercises([]);
    } finally {
      setLoading(false);
    }
  }, [split]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  return (
    <section aria-label={`${split} exercises`}>
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        {split} Exercises
      </h2>
      <ExerciseList
        split={split}
        exercises={exercises}
        loading={loading}
        onRefresh={fetchExercises}
      />
    </section>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-sm text-gray-500">Loading…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
