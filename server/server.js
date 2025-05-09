import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import dotenv from "dotenv";
import cors from "cors";
import { predictUpcomingMatches } from "./predictMatches.js";
// Load environment variables
dotenv.config();

// Setup PostgreSQL connection
// const pool = new Pool({
//   host: process.env.DB_HOST || "localhost",
//   user: process.env.DB_USER || "postgres",
//   password: process.env.DB_PASSWORD || "gunnawunna",
//   database: process.env.DB_NAME || "footballdb",
//   port: process.env.DB_PORT || 5432,
// });

const pool = new Pool({
  host: "localhost",
  user: "postgres",
  password: "gunnawunna",
  database: "footballdb",
  port: 5432,
});

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_URL = "http://localhost:5173";

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "../../dist")));
app.use(
  cors({
    origin: FRONTEND_URL,
  })
);

// API Routes
app.get("/api/matches", async (req, res) => {
  const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'matches'
      )
    `);

  if (!tableCheck.rows[0].exists) {
    return res.status(500).json({
      error: "Tables not found",
      solution: "Run database schema setup",
    });
  }

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
ORDER BY m.date ASC, m.id ASC;
    `;

    const result = await pool.query(query);

    const matches = result.rows.map((match) => ({
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

    res.json(matches);
  } catch (error) {
    console.error("Error fetching matches:", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

app.get("/api/stats", async (req, res) => {
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

    const stats = {
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

    res.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch prediction stats" });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const feedback = req.body;
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

    // After saving feedback, trigger model retraining and prediction update
    const { spawn } = await import("child_process");

    // Train model with new data
    const trainProcess = spawn("node", ["./trainModel.js"]);

    // Capture output more robustly
    trainProcess.stdout.on("data", (data) => {
      console.log(`Training stdout: ${data}`);
    });

    trainProcess.stderr.on("data", (data) => {
      console.error(`Training stderr: ${data}`);
    });

    trainProcess.on("error", (error) => {
      console.error("Training process error:", error);
    });

    trainProcess.on("close", (code) => {
      if (code === 0) {
        console.log("Model training completed successfully");
      } else {
        console.error(`Model training failed with code ${code}`);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// app.post("/api/predict-upcoming", async (req, res) => {
//   try {
//     const { spawn } = await import("child_process");
//     console.log(spawn);

//     const predictProcess = spawn("node", ["./predictMatches.js"]);

//     predictProcess.stdout.on("data", (data) => {
//       console.log(`Predict process stdout: ${data}`);
//     });

//     predictProcess.stderr.on("data", (data) => {
//       console.error(`Predict process stderr: ${data}`);
//     });

//     predictProcess.on("close", (code) => {
//       if (code === 0) {
//         console.log("Prediction process completed successfully");
//         res.json({
//           success: true,
//           message: "Predictions updated successfully",
//         });
//       } else {
//         console.error(`Prediction process failed with code ${code}`);
//         res.status(500).json({ error: "Prediction process failed" });
//       }
//     });
//   } catch (error) {
//     console.error("Error triggering predictions:", error);
//     res.status(500).json({ error: "Failed to trigger predictions" });
//   }
// });

// Replace the current /api/predict-upcoming route with:
app.post("/api/predict-upcoming", async (req, res) => {
  try {
    console.log("Manual prediction trigger received");
    await predictUpcomingMatches();
    res.json({
      success: true,
      message: "Predictions completed successfully",
    });
  } catch (error) {
    console.error("Error in prediction route:", error);
    res.status(500).json({
      error: "Prediction failed",
      details: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
