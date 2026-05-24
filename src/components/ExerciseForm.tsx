'use client';

import { useState, FormEvent } from 'react';

/**
 * Form for adding or editing an exercise name.
 * Inline validation for name length (1–50 chars).
 * Handles 409 duplicate responses from the API.
 *
 * Requirements: 3.1, 3.4, 3.5, 3.6
 */
interface ExerciseFormProps {
  /** Current split to associate the exercise with */
  split: string;
  /** If provided, the form is in edit mode */
  editingExercise?: { id: string; name: string } | null;
  /** Called after successful add/edit to refresh the list */
  onSuccess: () => void;
  /** Called to cancel edit mode */
  onCancel?: () => void;
}

export default function ExerciseForm({
  split,
  editingExercise,
  onSuccess,
  onCancel,
}: ExerciseFormProps) {
  const [name, setName] = useState(editingExercise?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEditMode = !!editingExercise;

  function validate(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 'Exercise name is required';
    }
    if (trimmed.length > 50) {
      return 'Exercise name must be 50 characters or less';
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validationError = validate(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let response: Response;

      if (isEditMode) {
        response = await fetch(`/api/exercises/${editingExercise.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
      } else {
        response = await fetch('/api/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), split }),
        });
      }

      if (response.status === 409) {
        setError('Exercise name already exists in this split');
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? 'An error occurred. Please try again.');
        return;
      }

      setName('');
      setError(null);
      onSuccess();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Exercise name"
          maxLength={50}
          aria-label="Exercise name"
          aria-invalid={!!error}
          aria-describedby={error ? 'exercise-form-error' : undefined}
          className="flex-1 min-h-touch px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={submitting}
          className="min-h-touch min-w-touch px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? '…' : isEditMode ? 'Save' : 'Add'}
        </button>
        {isEditMode && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-touch min-w-touch px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p id="exercise-form-error" className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
