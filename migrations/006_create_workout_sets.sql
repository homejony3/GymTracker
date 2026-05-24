-- Migration: Create workout_sets table
CREATE TABLE workout_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL CHECK (set_number >= 1 AND set_number <= 50),
    weight_kg DECIMAL(5,1) NOT NULL CHECK (weight_kg >= 0.0 AND weight_kg <= 500.0),
    reps INTEGER NOT NULL CHECK (reps >= 1 AND reps <= 999),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
