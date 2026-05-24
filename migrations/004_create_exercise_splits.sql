-- Migration: Create exercise_splits table
CREATE TABLE exercise_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    split VARCHAR(10) NOT NULL CHECK (split IN ('UPPER', 'LOWER', 'ARMS')),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (exercise_id, split)
);
