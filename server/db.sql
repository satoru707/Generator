-- Database schema for Football Prediction System

-- Matches table - stores match data
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  matchday VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  score VARCHAR(10),
  home_lineup JSONB,
  away_lineup JSONB,
  goals JSONB,
  match_link VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Predictions table - stores model predictions
CREATE TABLE predictions (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  score VARCHAR(10) NOT NULL,
  scorers JSONB NOT NULL,
  goal_times JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id)
);

-- Prediction feedback table - stores accuracy metrics
CREATE TABLE prediction_feedback (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  predicted_score VARCHAR(10) NOT NULL,
  actual_score VARCHAR(10) NOT NULL,
  predicted_scorers JSONB NOT NULL,
  actual_scorers JSONB NOT NULL,
  predicted_times JSONB NOT NULL,
  actual_times JSONB NOT NULL,
  score_accuracy INTEGER NOT NULL,
  scorer_accuracy INTEGER NOT NULL,
  time_accuracy INTEGER NOT NULL,
  unexpected_factors JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(match_id)
);

-- Embeddings table - stores vectors for players and teams
CREATE TABLE embeddings (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL, -- 'player' or 'team'
  entity_id INTEGER NOT NULL,
  entity_name VARCHAR(100) NOT NULL,
  vector FLOAT[] NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(type, entity_id)
);

-- Create indexes for performance
CREATE INDEX idx_matches_date ON matches(date);
CREATE INDEX idx_predictions_match_id ON predictions(match_id);
CREATE INDEX idx_feedback_match_id ON prediction_feedback(match_id);
CREATE INDEX idx_embeddings_type_entity ON embeddings(type, entity_id);

CREATE TABLE trained_matches (
  match_id INT PRIMARY KEY REFERENCES matches(id),
  trained_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sample data for testing
INSERT INTO matches (matchday, date, home_team, away_team, score, home_lineup, away_lineup, goals)
VALUES (
  'Game week 1',
  '2025-03-01',
  'Deportivo Riestra',
  'Estudiantes BA',
  '2 - 1',
  '[{"name": "M. Rodriguez", "events": [{"type": "Goal", "minute": "23''"}]}, {"name": "C. Lopez", "events": [{"type": "Goal", "minute": "56''"}]}]',
  '[{"name": "S. Brotzman", "events": [{"type": "Goal", "minute": "34''"}]}]',
  '[{"name": "M. Rodriguez", "minute": "23''", "score": "1 - 0"}, {"name": "S. Brotzman", "minute": "34''", "score": "1 - 1"}, {"name": "C. Lopez", "minute": "56''", "score": "2 - 1"}]'
);