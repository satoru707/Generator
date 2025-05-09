import { db } from "./database.js";
import dotenv from "dotenv";

dotenv.config();

async function evaluateModelPerformance() {
  console.log("Evaluating model performance...");

  try {
    const matches = await db.getMatches();
    const completedMatches = matches.filter(
      (match) => match.score && match.goals && match.prediction
    );

    console.log(
      `Found ${completedMatches.length} completed matches with predictions`
    );

    if (completedMatches.length === 0) {
      console.log(
        "No completed matches with predictions available for evaluation"
      );
      return;
    }

    // Group matches by matchday
    const matchesByDay = {};
    completedMatches.forEach((match) => {
      if (!matchesByDay[match.matchday]) {
        matchesByDay[match.matchday] = [];
      }
      matchesByDay[match.matchday].push(match);
    });

    // Enhanced evaluation metrics
    const weeklyAccuracy = [];
    let totalMetrics = {
      scoreAccuracy: 0,
      scorerAccuracy: 0,
      timeAccuracy: 0,
      exactScoreCount: 0,
      correctResultCount: 0,
      goalDifferenceAccuracy: 0,
      firstScorerAccuracy: 0,
      timingAccuracy: 0,
    };

    for (const [matchday, dayMatches] of Object.entries(matchesByDay)) {
      let dayMetrics = {
        scoreAccuracy: 0,
        scorerAccuracy: 0,
        timeAccuracy: 0,
        exactScoreCount: 0,
        correctResultCount: 0,
        goalDifferenceAccuracy: 0,
        firstScorerAccuracy: 0,
        timingAccuracy: 0,
      };

      for (const match of dayMatches) {
        const metrics = evaluateMatch(match);
        Object.keys(dayMetrics).forEach((key) => {
          dayMetrics[key] += metrics[key];
        });

        // Save detailed feedback
        await saveFeedback(
          match,
          metrics.scoreAccuracy,
          metrics.scorerAccuracy,
          metrics.timeAccuracy,
          metrics
        );
      }

      // Calculate averages for the matchday
      const matchCount = dayMatches.length;
      Object.keys(dayMetrics).forEach((key) => {
        dayMetrics[key] = Math.round((dayMetrics[key] / matchCount) * 100);
        totalMetrics[key] += dayMetrics[key];
      });

      weeklyAccuracy.push({
        week: matchday,
        ...dayMetrics,
      });

      // Log detailed matchday statistics
      console.log(`\n${matchday} Performance:`);
      console.log(`Score Accuracy: ${dayMetrics.scoreAccuracy}%`);
      console.log(`Scorer Accuracy: ${dayMetrics.scorerAccuracy}%`);
      console.log(`Time Accuracy: ${dayMetrics.timeAccuracy}%`);
      console.log(`Exact Score Rate: ${dayMetrics.exactScoreCount}%`);
      console.log(`Correct Result Rate: ${dayMetrics.correctResultCount}%`);
      console.log(
        `Goal Difference Accuracy: ${dayMetrics.goalDifferenceAccuracy}%`
      );
      console.log(`First Scorer Accuracy: ${dayMetrics.firstScorerAccuracy}%`);
      console.log(`Timing Accuracy: ${dayMetrics.timingAccuracy}%`);
    }

    // Calculate overall accuracy
    const weekCount = weeklyAccuracy.length;
    const overallAccuracy = {};
    Object.keys(totalMetrics).forEach((key) => {
      overallAccuracy[key] = Math.round(totalMetrics[key] / weekCount);
    });

    // Log overall performance
    console.log("\nOverall Model Performance:");
    console.log(`Score Prediction Accuracy: ${overallAccuracy.scoreAccuracy}%`);
    console.log(
      `Scorer Prediction Accuracy: ${overallAccuracy.scorerAccuracy}%`
    );
    console.log(`Time Prediction Accuracy: ${overallAccuracy.timeAccuracy}%`);
    console.log(`Exact Score Rate: ${overallAccuracy.exactScoreCount}%`);
    console.log(`Correct Result Rate: ${overallAccuracy.correctResultCount}%`);
    console.log(
      `Goal Difference Accuracy: ${overallAccuracy.goalDifferenceAccuracy}%`
    );
    console.log(
      `First Scorer Accuracy: ${overallAccuracy.firstScorerAccuracy}%`
    );
    console.log(`Timing Accuracy: ${overallAccuracy.timingAccuracy}%`);

    return {
      weeklyAccuracy,
      overallAccuracy,
    };
  } catch (error) {
    console.error("Evaluation error:", error);
    throw error;
  }
}

function evaluateMatch(match) {
  // Parse scores
  const [actualHome, actualAway] = match.score
    .split("-")
    .map((s) => parseInt(s.trim()));
  const [predictedHome, predictedAway] = match.prediction.score
    .split("-")
    .map((s) => parseInt(s.trim()));

  // Initialize metrics
  const metrics = {
    scoreAccuracy: 0,
    scorerAccuracy: 0,
    timeAccuracy: 0,
    exactScoreCount: 0,
    correctResultCount: 0,
    goalDifferenceAccuracy: 0,
    firstScorerAccuracy: 0,
    timingAccuracy: 0,
  };

  // Evaluate exact score prediction
  if (actualHome === predictedHome && actualAway === predictedAway) {
    metrics.exactScoreCount = 1;
    metrics.scoreAccuracy = 1;
  }

  // Evaluate result prediction (win/draw/loss)
  const actualResult =
    actualHome > actualAway ? "H" : actualHome < actualAway ? "A" : "D";
  const predictedResult =
    predictedHome > predictedAway
      ? "H"
      : predictedHome < predictedAway
      ? "A"
      : "D";
  if (actualResult === predictedResult) {
    metrics.correctResultCount = 1;
    metrics.scoreAccuracy += 0.5;
  }

  // Evaluate goal difference accuracy
  const actualDiff = actualHome - actualAway;
  const predictedDiff = predictedHome - predictedAway;
  metrics.goalDifferenceAccuracy =
    1 - Math.min(Math.abs(actualDiff - predictedDiff) / 3, 1);

  // Evaluate scorer predictions
  const actualScorers = match.goals.map((goal) => goal.name);
  const predictedScorers = match.prediction.scorers;
  const correctScorers = predictedScorers.filter((scorer) =>
    actualScorers.includes(scorer)
  );
  metrics.scorerAccuracy =
    actualScorers.length > 0
      ? correctScorers.length /
        Math.max(actualScorers.length, predictedScorers.length)
      : 0;

  // Evaluate first scorer
  if (actualScorers.length > 0 && predictedScorers.length > 0) {
    metrics.firstScorerAccuracy =
      actualScorers[0] === predictedScorers[0] ? 1 : 0;
  }

  // Evaluate timing accuracy
  const actualTimes = match.goals.map((goal) => parseInt(goal.minute));
  const predictedTimes = match.prediction.goalTimes.map((time) =>
    parseInt(time)
  );

  let timingPoints = 0;
  actualTimes.forEach((actualTime, index) => {
    if (index < predictedTimes.length) {
      const timeDiff = Math.abs(actualTime - predictedTimes[index]);
      if (timeDiff <= 5) timingPoints += 1;
      else if (timeDiff <= 15) timingPoints += 0.5;
      else if (timeDiff <= 30) timingPoints += 0.25;
    }
  });

  metrics.timingAccuracy =
    actualTimes.length > 0
      ? timingPoints / Math.max(actualTimes.length, predictedTimes.length)
      : 0;

  // Calculate overall time accuracy
  metrics.timeAccuracy =
    (metrics.timingAccuracy + metrics.firstScorerAccuracy) / 2;

  return metrics;
}

async function saveFeedback(
  match,
  scoreAccuracy,
  scorerAccuracy,
  timeAccuracy,
  metrics
) {
  const unexpectedFactors = [];

  // Check for red cards
  const redCards = [...match.homeLineup, ...match.awayLineup]
    .filter(
      (player) =>
        player.events && player.events.some((e) => e.type === "Red Card")
    )
    .map((player) => player.name);

  if (redCards.length > 0) {
    unexpectedFactors.push(`Red card(s) for: ${redCards.join(", ")}`);
  }

  // Check for significant score deviation
  const [actualHome, actualAway] = match.score
    .split("-")
    .map((s) => parseInt(s.trim()));
  const [predictedHome, predictedAway] = match.prediction.score
    .split("-")
    .map((s) => parseInt(s.trim()));

  if (
    Math.abs(actualHome + actualAway - (predictedHome + predictedAway)) >= 3
  ) {
    unexpectedFactors.push("Unexpected high/low scoring match");
  }

  // Check for unexpected scorers
  const unexpectedScorers = match.goals
    .map((goal) => goal.name)
    .filter((scorer) => !match.prediction.scorers.includes(scorer));

  if (unexpectedScorers.length > 0) {
    unexpectedFactors.push(
      `Unexpected scorers: ${unexpectedScorers.join(", ")}`
    );
  }

  // Prepare detailed feedback
  const feedback = {
    matchId: match.id,
    predictedScore: match.prediction.score,
    actualScore: match.score,
    predictedScorers: match.prediction.scorers,
    actualScorers: match.goals.map((g) => g.name),
    predictedTimes: match.prediction.goalTimes,
    actualTimes: match.goals.map((g) => g.minute),
    scoreAccuracy: Math.round(scoreAccuracy * 100),
    scorerAccuracy: Math.round(scorerAccuracy * 100),
    timeAccuracy: Math.round(timeAccuracy * 100),
    exactScoreRate: metrics.exactScoreCount * 100,
    correctResultRate: metrics.correctResultCount * 100,
    goalDifferenceAccuracy: Math.round(metrics.goalDifferenceAccuracy * 100),
    firstScorerAccuracy: metrics.firstScorerAccuracy * 100,
    timingAccuracy: Math.round(metrics.timingAccuracy * 100),
    unexpectedFactors,
  };

  // Save to database
  await db.savePredictionFeedback(feedback);
  console.log(`Saved detailed feedback for match ${match.id}`);
}

// Run evaluation
evaluateModelPerformance()
  .then(() => {
    console.log("Evaluation complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Evaluation failed:", err);
    process.exit(1);
  });
