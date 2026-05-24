'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { WorkoutSplit } from '@/types';

const SessionView = dynamic(() => import('@/components/SessionView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-6 w-24 bg-gray-200 rounded" />
      <div className="h-32 bg-gray-200 rounded-md" />
      <div className="h-32 bg-gray-200 rounded-md" />
    </div>
  ),
});

/**
 * Active session page.
 * Reads `split` from search params, creates a session via POST /api/sessions
 * if none active, shows exercises for the split with set logging.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 7.2, 7.5, 8.1, 8.3
 */

interface ExerciseData {
  id: string;
  name: string;
}

interface WorkoutSetData {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
}

interface SessionData {
  id: string;
  split: string;
  sessionDate: string;
  completed: boolean;
  sets: WorkoutSetData[];
}

function SessionContent() {
  const searchParams = useSearchParams();
  const split = (searchParams.get('split') as WorkoutSplit) || 'UPPER';

  const [session, setSession] = useState<SessionData | null>(null);
  const [exercises, setExercises] = useState<ExerciseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create or find an active session for the current split
  const initSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Create a new session for this split
      const createRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ split }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        setError(data.error || 'Failed to create session');
        setLoading(false);
        return;
      }

      const { session: newSession } = await createRes.json();

      // Fetch session detail (with sets)
      const detailRes = await fetch(`/api/sessions/${newSession.id}`);
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        setSession(detailData.session || detailData);
      } else {
        // Use the created session with empty sets
        setSession({ ...newSession, sets: [] });
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [split]);

  // Fetch exercises for the current split
  const fetchExercises = useCallback(async () => {
    try {
      const response = await fetch(`/api/exercises?split=${split}`);
      if (response.ok) {
        const data = await response.json();
        setExercises(data.exercises ?? []);
      }
    } catch {
      // Silently fail — exercises will show empty
    }
  }, [split]);

  // Refresh session detail (after adding/editing/deleting sets)
  const refreshSession = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch(`/api/sessions/${session.id}`);
      if (response.ok) {
        const data = await response.json();
        setSession(data.session || data);
      }
    } catch {
      // Silently fail — user can retry
    }
  }, [session]);

  useEffect(() => {
    initSession();
    fetchExercises();
  }, [initSession, fetchExercises]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">Starting session…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={initSession}
          className="min-h-touch px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">No active session</p>
      </div>
    );
  }

  return (
    <section aria-label={`${split} session`}>
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        {split} Session
      </h2>
      <SessionView
        session={session}
        exercises={exercises}
        onRefresh={refreshSession}
      />
    </section>
  );
}

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div className="py-8 text-center text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <SessionContent />
    </Suspense>
  );
}
