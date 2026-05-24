import { WEIGHT } from '@/lib/constants';

/**
 * FormatService — EU localization utilities for weight, date, and time formatting.
 */

/**
 * Format a weight value for EU display.
 * Uses comma as decimal separator, 1 decimal place, "kg" suffix.
 * Example: 72.5 → "72,5 kg"
 */
export function formatWeight(kg: number): string {
  const fixed = kg.toFixed(1);
  const formatted = fixed.replace('.', ',');
  return `${formatted} kg`;
}

/**
 * Format a date in EU format: DD.MM.YYYY (zero-padded).
 */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}.${month}.${year}`;
}

/**
 * Format a time in 24-hour format: HH:MM.
 */
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Parse a weight input string to a number.
 * Accepts both comma and dot as decimal separator.
 * Returns null if the input is invalid (multiple separators, non-numeric chars).
 */
export function parseWeightInput(input: string): number | null {
  const trimmed = input.trim();

  if (trimmed === '') {
    return null;
  }

  // Count decimal separators (both comma and dot)
  const commaCount = (trimmed.match(/,/g) || []).length;
  const dotCount = (trimmed.match(/\./g) || []).length;
  const totalSeparators = commaCount + dotCount;

  // Reject multiple separators
  if (totalSeparators > 1) {
    return null;
  }

  // Reject any character that is not a digit, comma, or dot
  if (!/^[\d.,]+$/.test(trimmed)) {
    return null;
  }

  // Normalize: replace comma with dot for parsing
  const normalized = trimmed.replace(',', '.');
  const value = parseFloat(normalized);

  if (isNaN(value)) {
    return null;
  }

  return value;
}

/**
 * Validate a weight input string.
 * Returns { valid: true } if the input is a valid weight value within range,
 * or { valid: false, error: string } with an appropriate error message.
 */
export function validateWeightInput(input: string): { valid: boolean; error?: string } {
  const trimmed = input.trim();

  if (trimmed === '') {
    return { valid: false, error: 'Weight is required' };
  }

  // Count decimal separators
  const commaCount = (trimmed.match(/,/g) || []).length;
  const dotCount = (trimmed.match(/\./g) || []).length;
  const totalSeparators = commaCount + dotCount;

  if (totalSeparators > 1) {
    return { valid: false, error: 'Only one decimal separator (comma or dot) is allowed' };
  }

  // Check for non-numeric characters (other than a single separator)
  if (!/^[\d.,]+$/.test(trimmed)) {
    return { valid: false, error: 'Only digits and a single decimal separator (comma or dot) are accepted' };
  }

  const value = parseWeightInput(input);

  if (value === null) {
    return { valid: false, error: 'Invalid weight format' };
  }

  if (value < WEIGHT.MIN) {
    return { valid: false, error: `Weight must be at least ${WEIGHT.MIN} kg` };
  }

  if (value > WEIGHT.MAX) {
    return { valid: false, error: `Weight must not exceed ${WEIGHT.MAX} kg` };
  }

  return { valid: true };
}
