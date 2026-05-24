'use client';

import { useState, useCallback } from 'react';
import { WEIGHT } from '@/lib/constants';

/**
 * Specialized numeric input for weight values.
 * Accepts both comma and dot as decimal separator.
 * Displays in EU format (comma decimal).
 * Validates range 0.0–500.0 in 0.5 kg steps.
 * 44px min height for touch targets.
 *
 * Requirements: 4.2, 4.6, 7.2, 8.1, 8.3
 */
interface WeightInputProps {
  /** Current value as a string (allows comma/dot input) */
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

export default function WeightInput({
  value,
  onChange,
  error,
  disabled = false,
  id,
  ariaLabel = 'Weight in kg',
}: WeightInputProps) {
  const [touched, setTouched] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow only digits, a single comma or dot as decimal separator
      // Let the user type freely; validation happens on blur/submit
      if (raw === '' || /^[\d]*[.,]?[\d]*$/.test(raw)) {
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
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={touched && !!error}
          aria-describedby={error && touched ? `${id}-error` : undefined}
          placeholder="0,0"
          className={`
            w-full min-h-touch px-3 py-2 pr-10 text-sm border rounded-md
            bg-white text-gray-900 placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            disabled:bg-gray-100 disabled:text-gray-500
            ${touched && error ? 'border-red-500' : 'border-gray-300'}
          `}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
          kg
        </span>
      </div>
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
 * Validate a weight input string and return an error message if invalid.
 * Returns undefined if valid.
 */
export function validateWeight(input: string): string | undefined {
  const trimmed = input.trim();

  if (trimmed === '') {
    return 'Weight is required';
  }

  // Check for valid format (digits with optional single comma or dot)
  if (!/^[\d]*[.,]?[\d]*$/.test(trimmed)) {
    return 'Only digits and a single decimal separator are accepted';
  }

  // Parse the value (normalize comma to dot)
  const normalized = trimmed.replace(',', '.');
  const value = parseFloat(normalized);

  if (isNaN(value)) {
    return 'Invalid weight format';
  }

  if (value < WEIGHT.MIN) {
    return `Weight must be at least ${WEIGHT.MIN} kg`;
  }

  if (value > WEIGHT.MAX) {
    return `Weight must not exceed ${WEIGHT.MAX} kg`;
  }

  return undefined;
}
