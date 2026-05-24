'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SetLogger from './SetLogger';

/**
 * Session container that shows the active session with all exercises
 * and their logged sets. Fetches session detail and exercises for the split.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 7.5
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

interface SessionViewProps {
  /** The active session */
  session: SessionData;
  /** Exercises for the current split */
  exercises: ExerciseData[];
  /** Called when session data needs to be refreshed */
  onRefresh: () => void;
}

export default function SessionView({
  session,
  exercises,
  onRefresh,
}: SessionViewProps) {
  const router = useRouter();
  const isActive = !session.completed;
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Group sets by exercise
  const setsByExercise = exercises.reduce<Record<string, WorkoutSetData[]>>(
    (acc, exercise) => {
      acc[exercise.id] = session.sets
        .filter((s) => s.exerciseId === exercise.id)
        .sort((a, b) => a.setNumber - b.setNumber);
      return acc;
    },
    {}
  );

  /**
   * Handle session completion.
   * Shows confirmation, POSTs to complete endpoint, handles errors.
   * Requirements: 4.4, 4.8
   */
  const handleCompleteSession = async () => {
    setCompleteError(null);

    const confirmed = window.confirm(
      'Are you sure you want to complete this session?'
    );
    if (!confirmed) return;

    setCompleting(true);

    try {
      const response = await fetch(`/api/sessions/${session.id}/complete`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 400) {
          setCompleteError('At least one set must be logged');
        } else {
          setCompleteError(data.error || 'Failed to complete session');
        }
        return;
      }

      // Success — redirect to history
      router.push('/history');
    } catch {
      setCompleteError('Network error. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  if (exercises.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 border border-dashed border-gray-300 rounded-md">
        <p className="text-sm text-gray-500">
          No exercises in this split. Add exercises first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Session status indicator */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isActive ? 'bg-green-500' : 'bg-gray-400'
          }`}
          aria-hidden="true"
        />
        <span className="text-xs text-gray-600">
          {isActive ? 'Session in progress' : 'Session completed'}
        </span>
      </div>

      {/* Exercise set loggers */}
      {exercises.map((exercise) => (
        <SetLogger
          key={exercise.id}
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          sessionId={session.id}
          sets={setsByExercise[exercise.id] || []}
          isActive={isActive}
          onSetsChanged={onRefresh}
        />
      ))}

      {/* Complete Session button — only shown for active sessions */}
      {isActive && (
        <div className="mt-4">
          {completeError && (
            <p className="text-sm text-red-600 mb-2" role="alert">
              {completeError}
            </p>
          )}
          <button
            onClick={handleCompleteSession}
            disabled={completing}
            className="w-full min-h-[44px] px-4 py-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed rounded-md transition-colors"
            aria-label="Complete session"
          >
            {completing ? 'Completing…' : 'Complete Session'}
          </button>
        </div>
      )}
    </div>
  );
}
