'use client';

import { useState } from 'react';
import ExerciseForm from './ExerciseForm';

/**
 * Displays exercises for a selected split with add/edit/remove actions.
 * Shows empty state when no exercises exist.
 * 44px touch targets on all action buttons.
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.4, 3.5, 3.6, 7.2
 */
interface Exercise {
  id: string;
  name: string;
}

interface ExerciseListProps {
  /** Currently selected workout split */
  split: string;
  /** List of exercises for the current split */
  exercises: Exercise[];
  /** Whether exercises are currently loading */
  loading: boolean;
  /** Called to refresh the exercise list */
  onRefresh: () => void;
}

export default function ExerciseList({
  split,
  exercises,
  loading,
  onRefresh,
}: ExerciseListProps) {
  const [editingExercise, setEditingExercise] = useState<{ id: string; name: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(exerciseId: string) {
    const confirmed = window.confirm('Are you sure you want to remove this exercise from the split?');
    if (!confirmed) return;

    setRemovingId(exerciseId);
    try {
      const response = await fetch(`/api/exercises/${exerciseId}?split=${split}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onRefresh();
      }
    } catch {
      // Network error — silently fail, user can retry
    } finally {
      setRemovingId(null);
    }
  }

  function handleEditSuccess() {
    setEditingExercise(null);
    onRefresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-gray-500">Loading exercises…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add / Edit form */}
      <ExerciseForm
        split={split}
        editingExercise={editingExercise}
        onSuccess={editingExercise ? handleEditSuccess : onRefresh}
        onCancel={editingExercise ? () => setEditingExercise(null) : undefined}
      />

      {/* Exercise list or empty state */}
      {exercises.length === 0 ? (
        <div className="flex items-center justify-center py-8 border border-dashed border-gray-300 rounded-md">
          <p className="text-sm text-gray-500">No exercises added to this split yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Exercise list">
          {exercises.map((exercise) => (
            <li
              key={exercise.id}
              className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-md"
            >
              <span className="text-sm text-gray-900 truncate flex-1 mr-2">
                {exercise.name}
              </span>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditingExercise({ id: exercise.id, name: exercise.name })}
                  aria-label={`Edit ${exercise.name}`}
                  className="min-h-touch min-w-touch flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleRemove(exercise.id)}
                  disabled={removingId === exercise.id}
                  aria-label={`Remove ${exercise.name}`}
                  className="min-h-touch min-w-touch flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
