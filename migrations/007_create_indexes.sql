-- Migration: Create indexes for query performance
CREATE INDEX idx_exercises_user_id ON exercises(user_id);
CREATE INDEX idx_exercise_splits_exercise_id ON exercise_splits(exercise_id);
CREATE INDEX idx_sessions_user_id_date ON sessions(user_id, session_date DESC);
CREATE INDEX idx_workout_sets_session_id ON workout_sets(session_id);
CREATE INDEX idx_workout_sets_exercise_id ON workout_sets(exercise_id);
CREATE INDEX idx_login_attempts_user_id_time ON login_attempts(user_id, attempted_at DESC);
