'use client';

import { useState, useCallback } from 'react';
import WeightInput, { validateWeight } from './WeightInput';
import RepInput, { validateReps } from './RepInput';
import { formatWeight } from '@/services/format.service';

/**
 * Set entry form for a single exercise within a session.
 * Shows logged sets with weight in EU format (comma decimal, "kg" suffix).
 * Provides add/edit/delete for sets while session is active.
 * Displays set count per exercise.
 *
 * Requirements: 4.2, 4.3, 4.5, 4.6, 4.7, 7.2, 7.5, 8.1, 8.3
 */

interface WorkoutSetData {
  id: string;
  setNumber: number;
  weightKg: number;
  reps: number;
}

interface SetLoggerProps {
  /** Exercise ID */
  exerciseId: string;
  /** Exercise name for display */
  exerciseName: string;
  /** Session ID for API calls */
  sessionId: string;
  /** Existing logged sets for this exercise */
  sets: WorkoutSetData[];
  /** Whether the session is still active (not completed) */
  isActive: boolean;
  /** Called after a set is added, edited, or deleted */
  onSetsChanged: () => void;
}

export default function SetLogger({
  exerciseId,
  exerciseName,
  sessionId,
  sets,
  isActive,
  onSetsChanged,
}: SetLoggerProps) {
  const [weightValue, setWeightValue] = useState('');
  const [repsValue, setRepsValue] = useState('');
  const [weightError, setWeightError] = useState<string | undefined>();
  const [repsError, setRepsError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editWeightError, setEditWeightError] = useState<string | undefined>();
  const [editRepsError, setEditRepsError] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddSet = useCallback(async () => {
    const wErr = validateWeight(weightValue);
    const rErr = validateReps(repsValue);
    setWeightError(wErr);
    setRepsError(rErr);

    if (wErr || rErr) return;

    // Parse weight (normalize comma to dot)
    const weightKg = parseFloat(weightValue.replace(',', '.'));
    const reps = parseInt(repsValue, 10);

    setSubmitting(true);
    try {
      const response = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, exerciseId, weightKg, reps }),
      });

      if (response.ok) {
        setWeightValue('');
        setRepsValue('');
        setWeightError(undefined);
        setRepsError(undefined);
        onSetsChanged();
      } else {
        const data = await response.json();
        // Show server-side validation error
        if (data.error) {
          setWeightError(data.error);
        }
      }
    } catch {
      setWeightError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [weightValue, repsValue, sessionId, exerciseId, onSetsChanged]);

  const handleStartEdit = useCallback((set: WorkoutSetData) => {
    setEditingSetId(set.id);
    // Display weight with comma for EU format
    setEditWeight(set.weightKg.toFixed(1).replace('.', ','));
    setEditReps(String(set.reps));
    setEditWeightError(undefined);
    setEditRepsError(undefined);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingSetId) return;

    const wErr = validateWeight(editWeight);
    const rErr = validateReps(editReps);
    setEditWeightError(wErr);
    setEditRepsError(rErr);

    if (wErr || rErr) return;

    const weightKg = parseFloat(editWeight.replace(',', '.'));
    const reps = parseInt(editReps, 10);

    setSubmitting(true);
    try {
      const response = await fetch(`/api/sets/${editingSetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg, reps }),
      });

      if (response.ok) {
        setEditingSetId(null);
        onSetsChanged();
      } else {
        const data = await response.json();
        if (data.error) {
          setEditWeightError(data.error);
        }
      }
    } catch {
      setEditWeightError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [editingSetId, editWeight, editReps, onSetsChanged]);

  const handleCancelEdit = useCallback(() => {
    setEditingSetId(null);
    setEditWeightError(undefined);
    setEditRepsError(undefined);
  }, []);

  const handleDelete = useCallback(async (setId: string) => {
    setDeletingId(setId);
    try {
      const response = await fetch(`/api/sets/${setId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onSetsChanged();
      }
    } catch {
      // Network error — silently fail, user can retry
    } finally {
      setDeletingId(null);
    }
  }, [onSetsChanged]);

  return (
    <div className="bg-white border border-gray-200 rounded-md p-3">
      {/* Exercise header with set count */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-900 truncate">
          {exerciseName}
        </h3>
        <span className="text-xs text-gray-500 shrink-0 ml-2">
          {sets.length} {sets.length === 1 ? 'set' : 'sets'}
        </span>
      </div>

      {/* Logged sets list */}
      {sets.length > 0 && (
        <ul className="flex flex-col gap-1 mb-3" aria-label={`Sets for ${exerciseName}`}>
          {sets.map((set) => (
            <li key={set.id} className="flex items-center gap-2 py-1">
              {editingSetId === set.id ? (
                /* Edit mode */
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <WeightInput
                        value={editWeight}
                        onChange={setEditWeight}
                        error={editWeightError}
                        id={`edit-weight-${set.id}`}
                        ariaLabel={`Edit weight for set ${set.setNumber}`}
                      />
                    </div>
                    <div className="flex-1">
                      <RepInput
                        value={editReps}
                        onChange={setEditReps}
                        error={editRepsError}
                        id={`edit-reps-${set.id}`}
                        ariaLabel={`Edit reps for set ${set.setNumber}`}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={submitting}
                      className="min-h-touch flex-1 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={submitting}
                      className="min-h-touch flex-1 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <>
                  <span className="text-xs text-gray-400 w-6 shrink-0">
                    #{set.setNumber}
                  </span>
                  <span className="text-sm text-gray-900 flex-1">
                    {formatWeight(set.weightKg)} × {set.reps}
                  </span>
                  {isActive && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleStartEdit(set)}
                        aria-label={`Edit set ${set.setNumber}`}
                        className="min-h-touch min-w-touch flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
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
                        onClick={() => handleDelete(set.id)}
                        disabled={deletingId === set.id}
                        aria-label={`Delete set ${set.setNumber}`}
                        className="min-h-touch min-w-touch flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
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
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add set form (only when session is active) */}
      {isActive && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor={`weight-${exerciseId}`} className="sr-only">
                Weight (kg)
              </label>
              <WeightInput
                value={weightValue}
                onChange={setWeightValue}
                error={weightError}
                id={`weight-${exerciseId}`}
                ariaLabel={`Weight for ${exerciseName}`}
              />
            </div>
            <div className="flex-1">
              <label htmlFor={`reps-${exerciseId}`} className="sr-only">
                Reps
              </label>
              <RepInput
                value={repsValue}
                onChange={setRepsValue}
                error={repsError}
                id={`reps-${exerciseId}`}
                ariaLabel={`Reps for ${exerciseName}`}
              />
            </div>
          </div>
          <button
            onClick={handleAddSet}
            disabled={submitting}
            className="min-h-touch w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add Set'}
          </button>
        </div>
      )}
    </div>
  );
}
