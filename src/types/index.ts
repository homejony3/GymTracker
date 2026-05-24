/**
 * Shared TypeScript types for Gym Tracker
 */

/** Workout split categories */
export type WorkoutSplit = 'UPPER' | 'LOWER' | 'ARMS';

/** All available workout splits */
export const WORKOUT_SPLITS: WorkoutSplit[] = ['UPPER', 'LOWER', 'ARMS'] as const;

/** Authenticated user */
export interface User {
  id: string;
  username: string;
  createdAt: Date;
}

/** Exercise belonging to one or more workout splits */
export interface Exercise {
  id: string;
  userId: string;
  name: string;
  /** Weight increment in kg (0.5–5.0 in 0.5 steps) */
  weightIncrement: number;
  splits: WorkoutSplit[];
  createdAt: Date;
}

/** A single workout session on a specific date */
export interface Session {
  id: string;
  userId: string;
  split: WorkoutSplit;
  sessionDate: Date;
  completed: boolean;
  createdAt: Date;
}

/** A single set within a session */
export interface WorkoutSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  /** Set number (1–50) */
  setNumber: number;
  /** Weight in kg (0.0–500.0 in 0.5 steps) */
  weightKg: number;
  /** Repetitions (1–999) */
  reps: number;
  createdAt: Date;
}

/** Weight suggestion for progressive overload */
export interface WeightSuggestion {
  exerciseId: string;
  suggestedWeightKg: number | null;
  reasoning: 'increase' | 'maintain' | 'no_history';
  previousWeightKg: number | null;
  incrementKg: number;
}
