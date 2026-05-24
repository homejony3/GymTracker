'use client';

import { useState, useCallback } from 'react';
import { REPS } from '@/lib/constants';

/**
 * Integer-only input for repetitions (1–999).
 * 44px min height for touch targets.
 * Inline validation with error messages.
 *
 * Requirements: 4.2, 4.7, 7.2
 */
interface RepInputProps {
  /** Current value as a string */
  value: string;
  /** Called when the input value changes */
  onChange: (value: string) => void;
  /** Validation error message to display below input */
  error?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Optional id for the input element */
  id?: string;
  /** Optional aria-label */
  ariaLabel?: string;
}

export default function RepInput({
  value,
  onChange,
  error,
  disabled = false,
  id,
  ariaLabel = 'Repetitions',
}: RepInputProps) {
  const [touched, setTouched] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow only digits (integer input)
      if (raw === '' || /^\d*$/.test(raw)) {
        onChange(raw);
      }
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={touched && !!error}
        aria-describedby={error && touched ? `${id}-error` : undefined}
        placeholder="1–999"
        className={`
          w-full min-h-touch px-3 py-2 text-sm border rounded-md
          bg-white text-gray-900 placeholder-gray-400
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:bg-gray-100 disabled:text-gray-500
          ${touched && error ? 'border-red-500' : 'border-gray-300'}
        `}
      />
      {touched && error && (
        <p
          id={`${id}-error`}
          className="text-xs text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Validate a reps input string and return an error message if invalid.
 * Returns undefined if valid.
 */
export function validateReps(input: string): string | undefined {
  const trimmed = input.trim();

  if (trimmed === '') {
    return 'Reps is required';
  }

  if (!/^\d+$/.test(trimmed)) {
    return 'Reps must be a whole number';
  }

  const value = parseInt(trimmed, 10);

  if (value < REPS.MIN) {
    return `Reps must be at least ${REPS.MIN}`;
  }

  if (value > REPS.MAX) {
    return `Reps must not exceed ${REPS.MAX}`;
  }

  return undefined;
}
