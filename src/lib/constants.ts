/**
 * Validation constants for Gym Tracker
 */

/** Weight validation range in kg */
export const WEIGHT = {
  MIN: 0.0,
  MAX: 500.0,
  STEP: 0.5,
} as const;

/** Reps validation range */
export const REPS = {
  MIN: 1,
  MAX: 999,
} as const;

/** Sets per exercise per session validation range */
export const SETS = {
  MIN: 1,
  MAX: 50,
} as const;

/** Exercise name length validation */
export const NAME_LENGTH = {
  MIN: 1,
  MAX: 50,
} as const;

/** Weight increment configuration per exercise */
export const WEIGHT_INCREMENT = {
  MIN: 0.5,
  MAX: 5.0,
  STEP: 0.5,
  DEFAULT: 1.0,
} as const;

/** Workout split enum values */
export const SPLITS = {
  UPPER: 'UPPER',
  LOWER: 'LOWER',
  ARMS: 'ARMS',
} as const;
