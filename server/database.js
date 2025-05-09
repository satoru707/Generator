/* eslint-disable no-undef */
import { Pool } from "pg";
import dotenv from "dotenv";

// Configure PostgreSQL connection
const pool = new Pool({
  host: "localhost",
  user: "postgres",
  password: "gunnawunna",
  database: "footballdb",
  port: 5432,
});

// Database operations
export const db = {
  // Fetch all matches with their predictions
  async getMatches() {
    const query = `
      SELECT m.*, p.score as predicted_score, p.scorers, p.goal_times
      FROM matches m
      LEFT JOIN predictions p ON m.id = p.match_id
      ORDER BY m.date ASC
    `;
    const result = await pool.query(query);
    return result.rows.map(formatMatchFromDb);
  },

  // Fetch incomplete matches (for prediction)
  async getIncompletedMatches() {
    const query = `
      SELECT m.*
      FROM matches m
      WHERE m.score IS NULL
      ORDER BY m.date ASC
    `;
    const result = await pool.query(query);
    return result.rows.map(formatMatchFromDb);
  },

  // Fetch matches with scores (for training)
  async getCompletedMatches() {
    const query = `
      SELECT m.*
      FROM matches m
      WHERE m.score IS NOT NULL
      ORDER BY m.date ASC
    `;
    const result = await pool.query(query);
    return result.rows.map(formatMatchFromDb);
  },

  // Save a prediction
  async savePrediction(matchId, prediction) {
    const query = `
    INSERT INTO predictions (match_id, score, scorers, goal_times)
    VALUES ($1, $2, $3::jsonb, $4::jsonb)
    ON CONFLICT (match_id) 
    DO UPDATE SET score = $2, scorers = $3::jsonb, goal_times = $4::jsonb
  `;
    await pool.query(query, [
      matchId,
      prediction.score,
      JSON.stringify(prediction.scorers),
      JSON.stringify(prediction.goalTimes),
    ]);
  },

  async getNewMatchesForTraining() {
    const query = `
    SELECT m.*
    FROM matches m
    WHERE m.score IS NOT NULL
    AND m.id NOT IN (SELECT match_id FROM trained_matches)
    ORDER BY m.date ASC
  `;
    const result = await pool.query(query);
    return result.rows.map(formatMatchFromDb);
  },

  async markMatchesAsTrained(matchIds) {
    const query = `
    INSERT INTO trained_matches (match_id, trained_at)
    VALUES ${matchIds.map((_, i) => `($${i + 1}, NOW())`).join(",")}
  `;
    await pool.query(query, matchIds);
  },

  // Save feedback on a prediction
  async savePredictionFeedback(feedback) {
    const query = `
      INSERT INTO prediction_feedback (
        match_id, predicted_score, actual_score, 
        predicted_scorers, actual_scorers, 
        predicted_times, actual_times,
        score_accuracy, scorer_accuracy, time_accuracy,
        unexpected_factors
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await pool.query(query, [
      feedback.matchId,
      feedback.predictedScore,
      feedback.actualScore,
      feedback.predictedScorers,
      feedback.actualScorers,
      feedback.predictedTimes,
      feedback.actualTimes,
      feedback.scoreAccuracy,
      feedback.scorerAccuracy,
      feedback.timeAccuracy,
      feedback.unexpectedFactors,
    ]);
  },

  // Get player form embeddings
  async getPlayerEmbeddings() {
    const query = `
      SELECT * FROM embeddings
      WHERE type = 'player'
    `;
    const result = await pool.query(query);
    return result.rows.map((row) => ({
      playerId: row.entity_id,
      playerName: row.entity_name,
      vector: row.vector,
      lastUpdated: row.updated_at,
    }));
  },

  // Save player form embedding
  async savePlayerEmbedding(embedding) {
    const query = `
      INSERT INTO embeddings (type, entity_id, entity_name, vector, updated_at)
      VALUES ('player', $1, $2, $3, NOW())
      ON CONFLICT (type, entity_id) 
      DO UPDATE SET vector = $3, updated_at = NOW()
    `;
    await pool.query(query, [
      embedding.playerId,
      embedding.playerName,
      embedding.vector,
    ]);
  },
};

// Helper function to format DB match results
function formatMatchFromDb(dbMatch) {
  return {
    id: dbMatch.id,
    matchday: dbMatch.matchday,
    date: dbMatch.date,
    homeTeam: dbMatch.home_team,
    awayTeam: dbMatch.away_team,
    score: dbMatch.score,
    homeLineup: dbMatch.home_lineup || [],
    awayLineup: dbMatch.away_lineup || [],
    goals: dbMatch.goals || null,
    prediction: dbMatch.predicted_score
      ? {
          score: dbMatch.predicted_score,
          scorers: dbMatch.scorers ? JSON.parse(dbMatch.scorers) : [],
          goalTimes: dbMatch.goal_times ? JSON.parse(dbMatch.goal_times) : [],
        }
      : null,
  };
}

// INSERT INTO matches (
//     matchday,
//     date,
//     home_team,
//     away_team,
//     score,
//     home_lineup,
//     away_lineup,
//     goals,
//     match_link
// ) VALUES
