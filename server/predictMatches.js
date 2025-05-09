import * as tf from "@tensorflow/tfjs-node";
import { db } from "./database.js";
import dotenv from "dotenv";
import {
  calculateTeamForm,
  getHeadToHeadStats,
  getPlayerRecentMatches,
  countRecentGoals,
  countRecentAssists,
  calculatePlayerForm,
  adjustScorePrediction,
  predictScorers,
  predictGoalTimes,
  PLAYER_EMBEDDING_SIZE,
  TEAM_EMBEDDING_SIZE,
  MAX_PLAYERS,
  GOAL_TIME_BINS,
  FORM_WINDOW,
} from "./matchUtils.js";

dotenv.config();

export async function predictUpcomingMatches() {
  console.log("Starting prediction for upcoming matches...");

  try {
    const model = await tf.loadLayersModel(
      "file://./models/football-prediction-model/model.json"
    );
    console.log("Model loaded successfully");

    const upcomingMatches = await db.getIncompletedMatches();
    console.log(
      `Found ${upcomingMatches.length} upcoming matches for prediction`
    );

    if (upcomingMatches.length === 0) {
      console.log("No upcoming matches need predictions");
      return;
    }

    const historicalMatches = await db.getCompletedMatches();
    const playerEmbeddings = await db.getPlayerEmbeddings();
    const playerDict = {};
    playerEmbeddings.forEach((embedding) => {
      playerDict[embedding.playerName] = embedding.playerId;
    });

    const teamNames = new Set([
      ...historicalMatches.map((m) => m.homeTeam),
      ...historicalMatches.map((m) => m.awayTeam),
    ]);
    const teamDict = Object.fromEntries(
      [...teamNames].map((name, i) => [name, i])
    );

    for (const match of upcomingMatches) {
      try {
        const { inputs, playerList, matchContext } = prepareMatchForPrediction(
          match,
          playerDict,
          teamDict,
          historicalMatches
        );

        // Make prediction
        const [scoreOutput, scorerOutput, timeOutput] = model.predict(inputs);

        // Process outputs
        const scoreData = scoreOutput.arraySync()[0];
        const scorerData = scorerOutput.arraySync()[0];
        const timeData = timeOutput.arraySync()[0];

        const prediction = processPrediction(
          scoreData,
          scorerData,
          timeData,
          playerList,
          matchContext
        );

        await db.savePrediction(match.id, prediction);

        console.log(`Prediction for ${match.homeTeam} vs ${match.awayTeam}:`);
        console.log(`Score: ${prediction.score}`);
        console.log(`Scorers: ${prediction.scorers.join(", ")}`);
        console.log(`Times: ${prediction.goalTimes.join(", ")}`);
        console.log("---");
      } catch (error) {
        console.error(`Error predicting match ${match.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Prediction error:", error);
    throw error;
  }
}

function prepareMatchForPrediction(
  match,
  playerDict,
  teamDict,
  historicalMatches
) {
  const homeTeamId = teamDict[match.homeTeam] || 0;
  const awayTeamId = teamDict[match.awayTeam] || 0;

  const homeTeamForm = calculateTeamForm(match.homeTeam, historicalMatches);
  const awayTeamForm = calculateTeamForm(match.awayTeam, historicalMatches);

  const h2hStats = getHeadToHeadStats(
    match.homeTeam,
    match.awayTeam,
    historicalMatches
  );

  const homePlayers = match.homeLineup.map((player) => {
    const recentMatches = getPlayerRecentMatches(
      player.name,
      historicalMatches
    );
    return {
      name: player.name,
      id: playerDict[player.name] || 0,
      form: calculatePlayerForm(player.events || [], recentMatches),
      recentGoals: countRecentGoals(player.name, recentMatches),
      recentAssists: countRecentAssists(player.name, recentMatches),
    };
  });

  const awayPlayers = match.awayLineup.map((player) => {
    const recentMatches = getPlayerRecentMatches(
      player.name,
      historicalMatches
    );
    return {
      name: player.name,
      id: playerDict[player.name] || 0,
      form: calculatePlayerForm(player.events || [], recentMatches),
      recentGoals: countRecentGoals(player.name, recentMatches),
      recentAssists: countRecentAssists(player.name, recentMatches),
    };
  });

  // Pad player arrays
  while (homePlayers.length < MAX_PLAYERS) {
    homePlayers.push({
      name: "padding",
      id: 0,
      form: 0,
      recentGoals: 0,
      recentAssists: 0,
    });
  }
  while (awayPlayers.length < MAX_PLAYERS) {
    awayPlayers.push({
      name: "padding",
      id: 0,
      form: 0,
      recentGoals: 0,
      recentAssists: 0,
    });
  }

  // Create input tensors
  const inputs = [
    tf.tensor2d([[homeTeamId]], [1, 1]),
    tf.tensor2d([[awayTeamId]], [1, 1]),
    tf.tensor2d([homePlayers.map((p) => p.id)], [1, MAX_PLAYERS]),
    tf.tensor2d([awayPlayers.map((p) => p.id)], [1, MAX_PLAYERS]),
    tf.tensor2d([homePlayers.map((p) => p.form)], [1, MAX_PLAYERS]),
    tf.tensor2d([awayPlayers.map((p) => p.form)], [1, MAX_PLAYERS]),
    tf.tensor2d(
      [
        [
          h2hStats.homeWins,
          h2hStats.awayWins,
          h2hStats.draws,
          h2hStats.homeGoals,
          h2hStats.awayGoals,
          h2hStats.totalMatches,
        ],
      ],
      [1, 6]
    ),
  ];

  const matchContext = {
    homeTeamForm,
    awayTeamForm,
    h2hStats,
    homePlayers: homePlayers.filter((p) => p.name !== "padding"),
    awayPlayers: awayPlayers.filter((p) => p.name !== "padding"),
  };

  return {
    inputs,
    playerList: [...homePlayers, ...awayPlayers].map((p) => p.name),
    matchContext,
  };
}

function processPrediction(
  scoreData,
  scorerData,
  timeData,
  playerList,
  matchContext
) {
  const [homeGoals, awayGoals] = adjustScorePrediction(scoreData, matchContext);
  const totalGoals = homeGoals + awayGoals;

  const scorers = predictScorers(
    scorerData,
    playerList,
    totalGoals,
    matchContext
  );

  const goalTimes = predictGoalTimes(timeData, totalGoals, matchContext);

  return {
    score: `${homeGoals} - ${awayGoals}`,
    scorers: scorers, // Convert array to JSON string
    goalTimes: goalTimes, // Convert array to JSON string
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  predictUpcomingMatches()
    .then(() => {
      console.log("Predictions complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Prediction failed:", err);
      process.exit(1);
    });
}
