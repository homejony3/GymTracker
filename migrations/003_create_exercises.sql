-- Migration: Create exercises table
CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    weight_increment DECIMAL(3,1) NOT NULL DEFAULT 1.0
        CHECK (weight_increment >= 0.5 AND weight_increment <= 5.0 AND MOD(weight_increment * 10, 5) = 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
