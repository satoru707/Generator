/* eslint-disable no-undef */
import { Pool } from "pg";
import dotenv from "dotenv";

const pool = new Pool({
  host: "localhost",
  user: "postgres",
  password: "gunnawunna",
  database: "footballdb",
  port: 5432,
});

// Fetch match data (including predictions and actual results)
export const fetchMatches = async () => {
  try {
    const query = `
      SELECT 
        m.*,
        p.score as predicted_score,
        p.scorers,
        p.goal_times,
        pf.score_accuracy,
        pf.scorer_accuracy,
        pf.time_accuracy
      FROM matches m
      LEFT JOIN predictions p ON m.id = p.match_id
      LEFT JOIN prediction_feedback pf ON m.id = pf.match_id
      ORDER BY m.date ASC, m.id ASC
    `;

    const result = await pool.query(query);

    return result.rows.map((match) => ({
      id: match.id,
      matchday: match.matchday,
      date: match.date,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      score: match.score,
      homeLineup: match.home_lineup || [],
      awayLineup: match.away_lineup || [],
      goals: match.goals || null,
      prediction: match.predicted_score
        ? {
            score: match.predicted_score,
            scorers: match.scorers || [],
            goalTimes: match.goal_times || [],
          }
        : null,
      accuracy: match.score_accuracy
        ? {
            score: match.score_accuracy,
            scorers: match.scorer_accuracy,
            times: match.time_accuracy,
          }
        : undefined,
    }));
  } catch (error) {
    console.error("Error fetching matches:", error);
    throw error;
  }
};

// Fetch prediction statistics
export const fetchPredictionStats = async () => {
  try {
    // Get weekly accuracy
    const weeklyQuery = `
      SELECT 
        m.matchday as week,
        AVG(pf.score_accuracy) as score_accuracy,
        AVG(pf.scorer_accuracy) as scorer_accuracy,
        AVG(pf.time_accuracy) as time_accuracy
      FROM matches m
      JOIN prediction_feedback pf ON m.id = pf.match_id
      GROUP BY m.matchday
      ORDER BY MIN(m.date)
    `;

    const weeklyResult = await pool.query(weeklyQuery);

    // Get overall accuracy
    const overallQuery = `
      SELECT 
        AVG(score_accuracy) as score,
        AVG(scorer_accuracy) as scorers,
        AVG(time_accuracy) as times
      FROM prediction_feedback
    `;

    const overallResult = await pool.query(overallQuery);

    return {
      weeklyAccuracy: weeklyResult.rows.map((row) => ({
        week: row.week,
        scoreAccuracy: Math.round(row.score_accuracy),
        scorerAccuracy: Math.round(row.scorer_accuracy),
        timeAccuracy: Math.round(row.time_accuracy),
      })),
      overallAccuracy: {
        score: Math.round(overallResult.rows[0].score),
        scorers: Math.round(overallResult.rows[0].scorers),
        times: Math.round(overallResult.rows[0].times),
      },
    };
  } catch (error) {
    console.error("Error fetching prediction stats:", error);
    throw error;
  }
};

// Submit feedback about a prediction
export const submitPredictionFeedback = async (feedback) => {
  try {
    const query = `
      INSERT INTO prediction_feedback (
        match_id, 
        predicted_score,
        actual_score,
        predicted_scorers,
        actual_scorers,
        predicted_times,
        actual_times,
        score_accuracy,
        scorer_accuracy,
        time_accuracy,
        unexpected_factors
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (match_id) 
      DO UPDATE SET
        predicted_score = EXCLUDED.predicted_score,
        actual_score = EXCLUDED.actual_score,
        predicted_scorers = EXCLUDED.predicted_scorers,
        actual_scorers = EXCLUDED.actual_scorers,
        predicted_times = EXCLUDED.predicted_times,
        actual_times = EXCLUDED.actual_times,
        score_accuracy = EXCLUDED.score_accuracy,
        scorer_accuracy = EXCLUDED.scorer_accuracy,
        time_accuracy = EXCLUDED.time_accuracy,
        unexpected_factors = EXCLUDED.unexpected_factors
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

    console.log("Feedback submitted successfully");
  } catch (error) {
    console.error("Error submitting feedback:", error);
    throw error;
  }
};
