import * as tf from "@tensorflow/tfjs-node";
import { db } from "./database.js";
import dotenv from "dotenv";
import { predictUpcomingMatches } from "./predictMatches.js";
import {
  calculateTeamForm,
  getHeadToHeadStats,
  getPlayerRecentMatches,
  countRecentGoals,
  countRecentAssists,
  calculatePlayerForm,
  PLAYER_EMBEDDING_SIZE,
  TEAM_EMBEDDING_SIZE,
  MAX_PLAYERS,
  GOAL_TIME_BINS,
  FORM_WINDOW,
} from "./matchUtils.js";
import fs from "fs";
import path from "path";
dotenv.config();

async function createPlayerEmbeddingLayer(matches) {
  const playerNames = new Set();

  matches.forEach((match) => {
    match.homeLineup.forEach((player) => playerNames.add(player.name));
    match.awayLineup.forEach((player) => playerNames.add(player.name));
  });

  const existingEmbeddings = await db.getPlayerEmbeddings();
  const existingEmbeddingsMap = new Map(
    existingEmbeddings.map((e) => [e.playerName, e.vector])
  );

  const playerDict = {};
  const playerEmbeddings = {};

  let playerIndex = 0;
  playerNames.forEach((name) => {
    playerDict[name] = playerIndex;

    if (existingEmbeddingsMap.has(name)) {
      playerEmbeddings[name] = existingEmbeddingsMap.get(name);
    } else {
      const stddev = Math.sqrt(
        2.0 / (playerNames.size + PLAYER_EMBEDDING_SIZE)
      );
      const randomEmbedding = Array.from(
        { length: PLAYER_EMBEDDING_SIZE },
        () => tf.randomNormal([1], 0, stddev).dataSync()[0]
      );
      playerEmbeddings[name] = randomEmbedding;
    }

    playerIndex++;
  });

  return {
    playerDict,
    playerEmbeddings,
    playerCount: playerNames.size,
  };
}

function preprocessMatch(match, historicalMatches = []) {
  const homeTeamId = match.homeTeam;
  const awayTeamId = match.awayTeam;

  const homeTeamForm = calculateTeamForm(homeTeamId, historicalMatches);
  const awayTeamForm = calculateTeamForm(awayTeamId, historicalMatches);

  const h2h = getHeadToHeadStats(homeTeamId, awayTeamId, historicalMatches);

  const homePlayers = match.homeLineup.map((player) => {
    const recentMatches = getPlayerRecentMatches(
      player.name,
      historicalMatches
    );
    return {
      name: player.name,
      form: calculatePlayerForm(player.events || [], recentMatches),
      position: player.position,
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
      form: calculatePlayerForm(player.events || [], recentMatches),
      position: player.position,
      recentGoals: countRecentGoals(player.name, recentMatches),
      recentAssists: countRecentAssists(player.name, recentMatches),
    };
  });

  return {
    teams: [homeTeamId, awayTeamId],
    teamForms: [homeTeamForm, awayTeamForm],
    h2hStats: h2h,
    homePlayers,
    awayPlayers,
    goals: match.goals || [],
    score: match.score,
    weather: match.weather,
    pitch: match.pitch,
    referee: match.referee,
  };
}

function buildModel(playerCount, teamCount) {
  // Input layers
  const homeTeamInput = tf.input({
    shape: [1],
    name: "homeTeam",
    dtype: "int32",
  });
  const awayTeamInput = tf.input({
    shape: [1],
    name: "awayTeam",
    dtype: "int32",
  });
  const homePlayersInput = tf.input({
    shape: [MAX_PLAYERS],
    name: "homePlayers",
    dtype: "int32",
  });
  const awayPlayersInput = tf.input({
    shape: [MAX_PLAYERS],
    name: "awayPlayers",
    dtype: "int32",
  });
  const homeFormInput = tf.input({ shape: [MAX_PLAYERS], name: "homeForm" });
  const awayFormInput = tf.input({ shape: [MAX_PLAYERS], name: "awayForm" });
  const h2hInput = tf.input({ shape: [6], name: "h2hStats" });

  // Embedding layers
  const teamEmbedding = tf.layers.embedding({
    inputDim: teamCount,
    outputDim: TEAM_EMBEDDING_SIZE,
    embeddingsInitializer: "glorotNormal",
    name: "teamEmbedding",
  });

  const playerEmbedding = tf.layers.embedding({
    inputDim: playerCount,
    outputDim: PLAYER_EMBEDDING_SIZE,
    embeddingsInitializer: "glorotNormal",
    name: "playerEmbedding",
  });

  // Apply embeddings
  const homeTeamEmbed = teamEmbedding.apply(homeTeamInput);
  const awayTeamEmbed = teamEmbedding.apply(awayTeamInput);
  const homePlayersEmbed = playerEmbedding.apply(homePlayersInput);
  const awayPlayersEmbed = playerEmbedding.apply(awayPlayersInput);

  // Attention mechanism
  const homeAttention = tf.layers
    .multiply()
    .apply([
      homePlayersEmbed,
      tf.layers.reshape({ targetShape: [MAX_PLAYERS, 1] }).apply(homeFormInput),
    ]);

  const awayAttention = tf.layers
    .multiply()
    .apply([
      awayPlayersEmbed,
      tf.layers.reshape({ targetShape: [MAX_PLAYERS, 1] }).apply(awayFormInput),
    ]);

  // Combine features
  const combinedFeatures = tf.layers
    .concatenate()
    .apply([
      tf.layers.flatten().apply(homeTeamEmbed),
      tf.layers.flatten().apply(awayTeamEmbed),
      tf.layers.flatten().apply(homeAttention),
      tf.layers.flatten().apply(awayAttention),
      h2hInput,
    ]);

  // Deep network
  const hidden1 = tf.layers
    .dense({
      units: 512,
      activation: "relu",
      kernelInitializer: "glorotNormal",
    })
    .apply(combinedFeatures);

  const dropout1 = tf.layers.dropout({ rate: 0.3 }).apply(hidden1);

  const hidden2 = tf.layers
    .dense({
      units: 256,
      activation: "relu",
      kernelInitializer: "glorotNormal",
    })
    .apply(dropout1);

  const dropout2 = tf.layers.dropout({ rate: 0.2 }).apply(hidden2);

  // Residual connection
  const residual = tf.layers
    .add()
    .apply([tf.layers.dense({ units: 256 }).apply(combinedFeatures), dropout2]);

  // Output layers
  const scoreOutput = tf.layers
    .dense({
      units: 2,
      activation: "softplus",
      kernelInitializer: "glorotNormal",
      name: "scoreOutput",
    })
    .apply(residual);

  const scorerLogits = tf.layers
    .dense({
      units: playerCount, // Use playerCount parameter instead of hardcoded value
      kernelInitializer: "glorotNormal",
    })
    .apply(residual);

  const scorerOutput = tf.layers
    .activation({
      activation: "sigmoid",
      name: "scorerOutput",
    })
    .apply(scorerLogits);

  const timeLogits = tf.layers
    .dense({
      units: GOAL_TIME_BINS,
      kernelInitializer: "glorotNormal",
    })
    .apply(residual);

  const timeOutput = tf.layers
    .activation({
      activation: "softmax",
      name: "timeOutput",
    })
    .apply(timeLogits);

  // Create model
  const model = tf.model({
    inputs: [
      homeTeamInput,
      awayTeamInput,
      homePlayersInput,
      awayPlayersInput,
      homeFormInput,
      awayFormInput,
      h2hInput,
    ],
    outputs: [scoreOutput, scorerOutput, timeOutput],
  });

  // Compile model
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: {
      scoreOutput: "meanSquaredError",
      scorerOutput: "binaryCrossentropy",
      timeOutput: "categoricalCrossentropy",
    },
    lossWeights: {
      scoreOutput: 1.0,
      scorerOutput: 0.7,
      timeOutput: 0.3,
    },
    metrics: ["accuracy"],
  });

  return model;
}

function prepareTrainingData(matches, playerDict, teamDict, playerCount) {
  const homeTeams = [];
  const awayTeams = [];
  const homePlayers = [];
  const awayPlayers = [];
  const homeForms = [];
  const awayForms = [];
  const h2hStats = [];
  const scores = [];
  const scorers = [];
  const times = [];

  matches.forEach((match) => {
    if (!match.score || !match.goals) return;

    const processed = preprocessMatch(match, matches);

    homeTeams.push(teamDict[processed.teams[0]]);
    awayTeams.push(teamDict[processed.teams[1]]);

    const homePlayerIds = processed.homePlayers.map(
      (p) => playerDict[p.name] || 0
    );
    const awayPlayerIds = processed.awayPlayers.map(
      (p) => playerDict[p.name] || 0
    );
    const homePlayerForms = processed.homePlayers.map((p) => p.form);
    const awayPlayerForms = processed.awayPlayers.map((p) => p.form);

    while (homePlayerIds.length < MAX_PLAYERS) homePlayerIds.push(0);
    while (awayPlayerIds.length < MAX_PLAYERS) awayPlayerIds.push(0);
    while (homePlayerForms.length < MAX_PLAYERS) homePlayerForms.push(0);
    while (awayPlayerForms.length < MAX_PLAYERS) awayPlayerForms.push(0);

    homePlayers.push(homePlayerIds);
    awayPlayers.push(awayPlayerIds);
    homeForms.push(homePlayerForms);
    awayForms.push(awayPlayerForms);

    h2hStats.push([
      processed.h2hStats.homeWins,
      processed.h2hStats.awayWins,
      processed.h2hStats.draws,
      processed.h2hStats.homeGoals,
      processed.h2hStats.awayGoals,
      processed.h2hStats.totalMatches,
    ]);

    const [homeScore, awayScore] = processed.score
      .split("-")
      .map((s) => parseInt(s.trim()));
    scores.push([homeScore, awayScore]);

    const scorerVector = new Array(playerCount).fill(0); // Use playerCount instead of Object.keys(playerDict).length
    const timeVector = new Array(GOAL_TIME_BINS).fill(0);
    processed.goals.forEach((goal) => {
      const playerIndex = playerDict[goal.name];
      if (playerIndex !== undefined) {
        scorerVector[playerIndex] = 1;
        const time = parseInt(goal.minute);
        if (!isNaN(time)) {
          const binIndex = Math.min(Math.floor(time / 15), GOAL_TIME_BINS - 1);
          timeVector[binIndex] = 1;
        }
      }
    });

    scorers.push(scorerVector);
    times.push(timeVector);
  });

  return {
    inputs: [
      tf.tensor2d(homeTeams, [homeTeams.length, 1]),
      tf.tensor2d(awayTeams, [awayTeams.length, 1]),
      tf.tensor2d(homePlayers, [homePlayers.length, MAX_PLAYERS]),
      tf.tensor2d(awayPlayers, [awayPlayers.length, MAX_PLAYERS]),
      tf.tensor2d(homeForms, [homeForms.length, MAX_PLAYERS]),
      tf.tensor2d(awayForms, [awayForms.length, MAX_PLAYERS]),
      tf.tensor2d(h2hStats, [h2hStats.length, 6]),
    ],
    outputs: [
      tf.tensor2d(scores, [scores.length, 2]),
      tf.tensor2d(scorers, [scorers.length, playerCount]),
      tf.tensor2d(times, [times.length, GOAL_TIME_BINS]),
    ],
  };
}

async function trainModel() {
  console.log("Starting model training...");

  try {
    const matches = await db.getCompletedMatches();
    console.log(`Fetched ${matches.length} completed matches for training`);

    if (matches.length === 0) {
      console.log("No completed matches available for training");
      return;
    }

    const { playerDict, playerEmbeddings, playerCount } =
      await createPlayerEmbeddingLayer(matches);
    const teamNames = new Set(matches.flatMap((m) => [m.homeTeam, m.awayTeam]));
    const teamDict = Object.fromEntries(
      [...teamNames].map((name, i) => [name, i])
    );

    console.log(
      `Found ${playerCount} unique players and ${teamNames.size} unique teams`
    );

    const modelPath = "file://./models/football-prediction-model/model.json";
    const localPath = "./models/football-prediction-model/model.json";
    const dirPath = path.dirname(localPath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    let model;
    const modelFileExists = fs.existsSync(localPath);

    if (modelFileExists) {
      try {
        model = await tf.loadLayersModel(modelPath);
        console.log("Loaded existing model");

        // Verify if the loaded model matches current player count
        const scorerLayer = model.layers.find((l) => l.name === "scorerOutput");
        if (
          scorerLayer &&
          scorerLayer.outputShape[scorerLayer.outputShape.length - 1] !==
            playerCount
        ) {
          console.log("Player count mismatch, building new model");
          model = buildModel(playerCount, teamNames.size);
        }
      } catch (e) {
        console.log("Error loading model, creating new one", e);
        model = buildModel(playerCount, teamNames.size);
      }
    } else {
      model = buildModel(playerCount, teamNames.size);
      console.log("Created new model");
    }

    // Always compile the model (required before training)
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: {
        scoreOutput: "meanSquaredError",
        scorerOutput: "binaryCrossentropy",
        timeOutput: "categoricalCrossentropy",
      },
      lossWeights: {
        scoreOutput: 1.0,
        scorerOutput: 0.7,
        timeOutput: 0.3,
      },
      metrics: ["accuracy"],
    });

    const trainingData = prepareTrainingData(
      matches,
      playerDict,
      teamDict,
      playerCount
    );

    let bestLoss = Infinity;
    let patienceCount = 0;
    const epochs = modelFileExists ? 20 : 100;
    const patience = modelFileExists ? 5 : 10;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const result = await model.fit(
        trainingData.inputs,
        trainingData.outputs,
        {
          epochs: 1,
          batchSize: 32,
          validationSplit: 0.2,
          shuffle: true,
        }
      );

      const currentLoss = result.history.loss[0];
      console.log(`Epoch ${epoch + 1}: loss = ${currentLoss.toFixed(4)}`);

      if (currentLoss < bestLoss) {
        bestLoss = currentLoss;
        patienceCount = 0;
        await model.save("file://./models/football-prediction-model");
      } else {
        patienceCount++;
        if (patienceCount >= patience) {
          console.log("Early stopping triggered");
          break;
        }
      }
    }

    // Save player embeddings
    const playerLayer = model.getLayer("playerEmbedding");
    const weights = playerLayer.getWeights()[0];
    const playerEmbeddingValues = weights.arraySync();

    for (const [playerName, playerIndex] of Object.entries(playerDict)) {
      await db.savePlayerEmbedding({
        playerId: playerIndex,
        playerName,
        vector: playerEmbeddingValues[playerIndex],
      });
    }

    console.log("Model and embeddings saved successfully");
    console.log("Running predictions for upcoming matches...");
    await predictUpcomingMatches();
    console.log("Predictions completed successfully");
  } catch (error) {
    console.error("Error in training process:", error);
    throw error;
  }
}

trainModel()
  .then(() => {
    console.log("Training complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Training failed:", err);
    process.exit(1);
  });

// import * as tf from "@tensorflow/tfjs-node";
// import { db } from "./database.js";
// import dotenv from "dotenv";
// import { predictUpcomingMatches } from "./predictMatches.js";
// import {
//   calculateTeamForm,
//   getHeadToHeadStats,
//   getPlayerRecentMatches,
//   countRecentGoals,
//   countRecentAssists,
//   calculatePlayerForm,
//   PLAYER_EMBEDDING_SIZE,
//   TEAM_EMBEDDING_SIZE,
//   MAX_PLAYERS,
//   GOAL_TIME_BINS,
//   FORM_WINDOW,
// } from "./matchUtils.js";

// dotenv.config();

// async function createPlayerEmbeddingLayer(matches) {
//   const playerNames = new Set();

//   matches.forEach((match) => {
//     match.homeLineup.forEach((player) => playerNames.add(player.name));
//     match.awayLineup.forEach((player) => playerNames.add(player.name));
//   });

//   const existingEmbeddings = await db.getPlayerEmbeddings();
//   const existingEmbeddingsMap = new Map(
//     existingEmbeddings.map((e) => [e.playerName, e.vector])
//   );

//   const playerDict = {};
//   const playerEmbeddings = {};

//   let playerIndex = 0;
//   playerNames.forEach((name) => {
//     playerDict[name] = playerIndex;

//     if (existingEmbeddingsMap.has(name)) {
//       playerEmbeddings[name] = existingEmbeddingsMap.get(name);
//     } else {
//       const stddev = Math.sqrt(
//         2.0 / (playerNames.size + PLAYER_EMBEDDING_SIZE)
//       );
//       const randomEmbedding = Array.from(
//         { length: PLAYER_EMBEDDING_SIZE },
//         () => tf.randomNormal([1], 0, stddev).dataSync()[0]
//       );
//       playerEmbeddings[name] = randomEmbedding;
//     }

//     playerIndex++;
//   });

//   return {
//     playerDict,
//     playerEmbeddings,
//     playerCount: playerNames.size,
//   };
// }

// function preprocessMatch(match, historicalMatches = []) {
//   const homeTeamId = match.homeTeam;
//   const awayTeamId = match.awayTeam;

//   const homeTeamForm = calculateTeamForm(homeTeamId, historicalMatches);
//   const awayTeamForm = calculateTeamForm(awayTeamId, historicalMatches);

//   const h2h = getHeadToHeadStats(homeTeamId, awayTeamId, historicalMatches);

//   const homePlayers = match.homeLineup.map((player) => {
//     const recentMatches = getPlayerRecentMatches(
//       player.name,
//       historicalMatches
//     );
//     return {
//       name: player.name,
//       form: calculatePlayerForm(player.events || [], recentMatches),
//       position: player.position,
//       recentGoals: countRecentGoals(player.name, recentMatches),
//       recentAssists: countRecentAssists(player.name, recentMatches),
//     };
//   });

//   const awayPlayers = match.awayLineup.map((player) => {
//     const recentMatches = getPlayerRecentMatches(
//       player.name,
//       historicalMatches
//     );
//     return {
//       name: player.name,
//       form: calculatePlayerForm(player.events || [], recentMatches),
//       position: player.position,
//       recentGoals: countRecentGoals(player.name, recentMatches),
//       recentAssists: countRecentAssists(player.name, recentMatches),
//     };
//   });

//   return {
//     teams: [homeTeamId, awayTeamId],
//     teamForms: [homeTeamForm, awayTeamForm],
//     h2hStats: h2h,
//     homePlayers,
//     awayPlayers,
//     goals: match.goals || [],
//     score: match.score,
//     weather: match.weather,
//     pitch: match.pitch,
//     referee: match.referee,
//   };
// }

// function buildModel(playerCount, teamCount) {
//   // Input layers
//   const homeTeamInput = tf.input({
//     shape: [1],
//     name: "homeTeam",
//     dtype: "int32",
//   });
//   const awayTeamInput = tf.input({
//     shape: [1],
//     name: "awayTeam",
//     dtype: "int32",
//   });
//   const homePlayersInput = tf.input({
//     shape: [MAX_PLAYERS],
//     name: "homePlayers",
//     dtype: "int32",
//   });
//   const awayPlayersInput = tf.input({
//     shape: [MAX_PLAYERS],
//     name: "awayPlayers",
//     dtype: "int32",
//   });
//   const homeFormInput = tf.input({ shape: [MAX_PLAYERS], name: "homeForm" });
//   const awayFormInput = tf.input({ shape: [MAX_PLAYERS], name: "awayForm" });
//   const h2hInput = tf.input({ shape: [6], name: "h2hStats" });

//   // Embedding layers
//   const teamEmbedding = tf.layers.embedding({
//     inputDim: teamCount,
//     outputDim: TEAM_EMBEDDING_SIZE,
//     embeddingsInitializer: "glorotNormal",
//     name: "teamEmbedding",
//   });

//   const playerEmbedding = tf.layers.embedding({
//     inputDim: playerCount,
//     outputDim: PLAYER_EMBEDDING_SIZE,
//     embeddingsInitializer: "glorotNormal",
//     name: "playerEmbedding",
//   });

//   // Apply embeddings
//   const homeTeamEmbed = teamEmbedding.apply(homeTeamInput);
//   const awayTeamEmbed = teamEmbedding.apply(awayTeamInput);
//   const homePlayersEmbed = playerEmbedding.apply(homePlayersInput);
//   const awayPlayersEmbed = playerEmbedding.apply(awayPlayersInput);

//   // Attention mechanism
//   const homeAttention = tf.layers
//     .multiply()
//     .apply([
//       homePlayersEmbed,
//       tf.layers.reshape({ targetShape: [MAX_PLAYERS, 1] }).apply(homeFormInput),
//     ]);

//   const awayAttention = tf.layers
//     .multiply()
//     .apply([
//       awayPlayersEmbed,
//       tf.layers.reshape({ targetShape: [MAX_PLAYERS, 1] }).apply(awayFormInput),
//     ]);

//   // Combine features
//   const combinedFeatures = tf.layers
//     .concatenate()
//     .apply([
//       tf.layers.flatten().apply(homeTeamEmbed),
//       tf.layers.flatten().apply(awayTeamEmbed),
//       tf.layers.flatten().apply(homeAttention),
//       tf.layers.flatten().apply(awayAttention),
//       h2hInput,
//     ]);

//   // Deep network
//   const hidden1 = tf.layers
//     .dense({
//       units: 512,
//       activation: "relu",
//       kernelInitializer: "glorotNormal",
//     })
//     .apply(combinedFeatures);

//   const dropout1 = tf.layers.dropout({ rate: 0.3 }).apply(hidden1);

//   const hidden2 = tf.layers
//     .dense({
//       units: 256,
//       activation: "relu",
//       kernelInitializer: "glorotNormal",
//     })
//     .apply(dropout1);

//   const dropout2 = tf.layers.dropout({ rate: 0.2 }).apply(hidden2);

//   // Residual connection
//   const residual = tf.layers
//     .add()
//     .apply([tf.layers.dense({ units: 256 }).apply(combinedFeatures), dropout2]);

//   // Output layers
//   const scoreOutput = tf.layers
//     .dense({
//       units: 2,
//       activation: "softplus",
//       kernelInitializer: "glorotNormal",
//       name: "scoreOutput",
//     })
//     .apply(residual);

//   const scorerLogits = tf.layers
//     .dense({
//       units: playerCount,
//       kernelInitializer: "glorotNormal",
//     })
//     .apply(residual);

//   const scorerOutput = tf.layers
//     .activation({
//       activation: "sigmoid",
//       name: "scorerOutput",
//     })
//     .apply(scorerLogits);

//   const timeLogits = tf.layers
//     .dense({
//       units: GOAL_TIME_BINS,
//       kernelInitializer: "glorotNormal",
//     })
//     .apply(residual);

//   const timeOutput = tf.layers
//     .activation({
//       activation: "softmax",
//       name: "timeOutput",
//     })
//     .apply(timeLogits);

//   // Create model
//   const model = tf.model({
//     inputs: [
//       homeTeamInput,
//       awayTeamInput,
//       homePlayersInput,
//       awayPlayersInput,
//       homeFormInput,
//       awayFormInput,
//       h2hInput,
//     ],
//     outputs: [scoreOutput, scorerOutput, timeOutput],
//   });

//   // Compile model
//   model.compile({
//     optimizer: tf.train.adam(0.001),
//     loss: {
//       scoreOutput: "meanSquaredError",
//       scorerOutput: "binaryCrossentropy",
//       timeOutput: "categoricalCrossentropy",
//     },
//     lossWeights: {
//       scoreOutput: 1.0,
//       scorerOutput: 0.7,
//       timeOutput: 0.3,
//     },
//     metrics: ["accuracy"],
//   });

//   return model;
// }

// function prepareTrainingData(matches, playerDict, teamDict) {
//   const homeTeams = [];
//   const awayTeams = [];
//   const homePlayers = [];
//   const awayPlayers = [];
//   const homeForms = [];
//   const awayForms = [];
//   const h2hStats = [];
//   const scores = [];
//   const scorers = [];
//   const times = [];

//   matches.forEach((match) => {
//     if (!match.score || !match.goals) return;

//     const processed = preprocessMatch(match, matches);

//     homeTeams.push(teamDict[processed.teams[0]]);
//     awayTeams.push(teamDict[processed.teams[1]]);

//     const homePlayerIds = processed.homePlayers.map(
//       (p) => playerDict[p.name] || 0
//     );
//     const awayPlayerIds = processed.awayPlayers.map(
//       (p) => playerDict[p.name] || 0
//     );
//     const homePlayerForms = processed.homePlayers.map((p) => p.form);
//     const awayPlayerForms = processed.awayPlayers.map((p) => p.form);

//     while (homePlayerIds.length < MAX_PLAYERS) homePlayerIds.push(0);
//     while (awayPlayerIds.length < MAX_PLAYERS) awayPlayerIds.push(0);
//     while (homePlayerForms.length < MAX_PLAYERS) homePlayerForms.push(0);
//     while (awayPlayerForms.length < MAX_PLAYERS) awayPlayerForms.push(0);

//     homePlayers.push(homePlayerIds);
//     awayPlayers.push(awayPlayerIds);
//     homeForms.push(homePlayerForms);
//     awayForms.push(awayPlayerForms);

//     h2hStats.push([
//       processed.h2hStats.homeWins,
//       processed.h2hStats.awayWins,
//       processed.h2hStats.draws,
//       processed.h2hStats.homeGoals,
//       processed.h2hStats.awayGoals,
//       processed.h2hStats.totalMatches,
//     ]);

//     const [homeScore, awayScore] = processed.score
//       .split("-")
//       .map((s) => parseInt(s.trim()));
//     scores.push([homeScore, awayScore]);

//     const scorerVector = new Array(Object.keys(playerDict).length).fill(0);
//     const timeVector = new Array(GOAL_TIME_BINS).fill(0);

//     processed.goals.forEach((goal) => {
//       const playerIndex = playerDict[goal.name];
//       if (playerIndex !== undefined) {
//         scorerVector[playerIndex] = 1;
//         const time = parseInt(goal.minute);
//         if (!isNaN(time)) {
//           const binIndex = Math.min(Math.floor(time / 15), GOAL_TIME_BINS - 1);
//           timeVector[binIndex] = 1;
//         }
//       }
//     });

//     scorers.push(scorerVector);
//     times.push(timeVector);
//   });

//   return {
//     inputs: [
//       tf.tensor2d(homeTeams, [homeTeams.length, 1]),
//       tf.tensor2d(awayTeams, [awayTeams.length, 1]),
//       tf.tensor2d(homePlayers, [homePlayers.length, MAX_PLAYERS]),
//       tf.tensor2d(awayPlayers, [awayPlayers.length, MAX_PLAYERS]),
//       tf.tensor2d(homeForms, [homeForms.length, MAX_PLAYERS]),
//       tf.tensor2d(awayForms, [awayForms.length, MAX_PLAYERS]),
//       tf.tensor2d(h2hStats, [h2hStats.length, 6]),
//     ],
//     outputs: [
//       tf.tensor2d(scores, [scores.length, 2]),
//       tf.tensor2d(scorers, [scorers.length, Object.keys(playerDict).length]),
//       tf.tensor2d(times, [times.length, GOAL_TIME_BINS]),
//     ],
//   };
// }
// async function trainModel() {
//   console.log("Starting model training...");

//   try {
//     // Get only new matches that haven't been used for training before
//     const newMatches = await db.getNewMatchesForTraining();
//     console.log(`Fetched ${newMatches.length} new matches for training`);

//     if (newMatches.length === 0) {
//       console.log("No new matches available for training");
//       return;
//     }

//     // Get all completed matches for context (form calculations, etc.)
//     const allCompletedMatches = await db.getCompletedMatches();

//     const { playerDict, playerEmbeddings, playerCount } =
//       await createPlayerEmbeddingLayer(allCompletedMatches);
//     const teamNames = new Set(
//       allCompletedMatches.flatMap((m) => [m.homeTeam, m.awayTeam])
//     );
//     const teamDict = Object.fromEntries(
//       [...teamNames].map((name, i) => [name, i])
//     );

//     console.log(
//       `Found ${playerCount} unique players and ${teamNames.size} unique teams`
//     );

//     // Load existing model
//     const model = await tf.loadLayersModel(
//       "file://./models/football-prediction-model/model.json"
//     );
//     console.log("Loaded existing model for continued training");

//     // Recompile the model before training
//     model.compile({
//       optimizer: tf.train.adam(0.001),
//       loss: {
//         scoreOutput: "meanSquaredError",
//         scorerOutput: "binaryCrossentropy",
//         timeOutput: "categoricalCrossentropy",
//       },
//       lossWeights: {
//         scoreOutput: 1.0,
//         scorerOutput: 0.7,
//         timeOutput: 0.3,
//       },
//       metrics: ["accuracy"],
//     });

//     // Prepare training data with only new matches
//     const trainingData = prepareTrainingData(newMatches, playerDict, teamDict);

//     // Training configuration
//     const epochs = 20;
//     const patience = 5;
//     let bestLoss = Infinity;
//     let patienceCount = 0;

//     for (let epoch = 0; epoch < epochs; epoch++) {
//       const result = await model.fit(
//         trainingData.inputs,
//         trainingData.outputs,
//         {
//           epochs: 1,
//           batchSize: 32,
//           validationSplit: 0.2,
//           shuffle: true,
//         }
//       );

//       const currentLoss = result.history.loss[0];
//       console.log(`Epoch ${epoch + 1}: loss = ${currentLoss.toFixed(4)}`);

//       if (currentLoss < bestLoss) {
//         bestLoss = currentLoss;
//         patienceCount = 0;
//         await model.save("file://./models/football-prediction-model");
//       } else {
//         patienceCount++;
//         if (patienceCount >= patience) {
//           console.log("Early stopping triggered");
//           break;
//         }
//       }
//     }

//     // Update player embeddings
//     const playerLayer = model.getLayer("playerEmbedding");
//     const weights = playerLayer.getWeights()[0];
//     const playerEmbeddingValues = weights.arraySync();

//     for (const [playerName, playerIndex] of Object.entries(playerDict)) {
//       await db.savePlayerEmbedding({
//         playerId: playerIndex,
//         playerName,
//         vector: playerEmbeddingValues[playerIndex],
//       });
//     }

//     // Mark the newly trained matches as trained
//     const matchIds = newMatches.map((match) => match.id);
//     await db.markMatchesAsTrained(matchIds);

//     console.log("Model and embeddings updated successfully");
//     console.log(`${newMatches.length} matches marked as trained`);

//     console.log("Running predictions for upcoming matches...");
//     await predictUpcomingMatches();
//     console.log("Predictions completed successfully");
//   } catch (error) {
//     console.error("Error in training process:", error);
//     throw error;
//   }
// }

// trainModel()
//   .then(() => {
//     console.log("Training complete");
//     process.exit(0);
//   })
//   .catch((err) => {
//     console.error("Training failed:", err);
//     process.exit(1);
//   });
