// matchUtils.js
import * as tf from "@tensorflow/tfjs-node";

// Constants
export const PLAYER_EMBEDDING_SIZE = 64;
export const TEAM_EMBEDDING_SIZE = 32;
export const MAX_PLAYERS = 22;
export const GOAL_TIME_BINS = 6;
export const FORM_WINDOW = 5;
export const HISTORICAL_MATCHUP_WEIGHT = 0.3;
export const RECENT_FORM_WEIGHT = 0.4;
export const HEAD_TO_HEAD_WEIGHT = 0.3;

/**
 * Calculate team form based on recent matches
 * @param {string} teamId - Team identifier
 * @param {Array} matches - Array of match objects
 * @returns {number} Form score
 */
export function calculateTeamForm(teamId, matches) {
  const recentMatches = matches
    .filter((m) => m.homeTeam === teamId || m.awayTeam === teamId)
    .slice(0, FORM_WINDOW);

  let form = 0;
  recentMatches.forEach((match, index) => {
    const weight = Math.pow(0.9, index); // Exponential decay
    const isHome = match.homeTeam === teamId;
    const teamScore = isHome
      ? parseInt(match.score.split("-")[0])
      : parseInt(match.score.split("-")[1]);
    const oppositionScore = isHome
      ? parseInt(match.score.split("-")[1])
      : parseInt(match.score.split("-")[0]);

    if (teamScore > oppositionScore) form += 3 * weight;
    else if (teamScore === oppositionScore) form += 1 * weight;

    // Additional factors
    if (teamScore >= 3) form += 0.5 * weight; // Bonus for high scoring
    if (oppositionScore === 0) form += 0.5 * weight; // Bonus for clean sheet
  });

  return form;
}

/**
 * Get head-to-head statistics between two teams
 * @param {string} homeTeamId - Home team identifier
 * @param {string} awayTeamId - Away team identifier
 * @param {Array} matches - Array of match objects
 * @returns {Object} Head-to-head statistics
 */
export function getHeadToHeadStats(homeTeamId, awayTeamId, matches) {
  const h2hMatches = matches.filter(
    (m) =>
      (m.homeTeam === homeTeamId && m.awayTeam === awayTeamId) ||
      (m.homeTeam === awayTeamId && m.awayTeam === homeTeamId)
  );

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let homeGoals = 0;
  let awayGoals = 0;

  h2hMatches.forEach((match) => {
    const [homeScore, awayScore] = match.score
      .split("-")
      .map((s) => parseInt(s.trim()));
    if (match.homeTeam === homeTeamId) {
      homeGoals += homeScore;
      awayGoals += awayScore;
      if (homeScore > awayScore) homeWins++;
      else if (homeScore < awayScore) awayWins++;
      else draws++;
    } else {
      homeGoals += awayScore;
      awayGoals += homeScore;
      if (homeScore < awayScore) homeWins++;
      else if (homeScore > awayScore) awayWins++;
      else draws++;
    }
  });

  return {
    homeWins,
    awayWins,
    draws,
    homeGoals,
    awayGoals,
    totalMatches: h2hMatches.length,
  };
}

/**
 * Get recent matches for a player
 * @param {string} playerName - Player name
 * @param {Array} matches - Array of match objects
 * @returns {Array} Array of recent matches
 */
export function getPlayerRecentMatches(playerName, matches) {
  return matches
    .filter(
      (m) =>
        m.homeLineup.some((p) => p.name === playerName) ||
        m.awayLineup.some((p) => p.name === playerName)
    )
    .slice(0, FORM_WINDOW);
}

/**
 * Count recent goals for a player
 * @param {string} playerName - Player name
 * @param {Array} matches - Array of match objects
 * @returns {number} Goal count
 */
export function countRecentGoals(playerName, matches) {
  return matches.reduce((count, match) => {
    const goals = match.goals || [];
    return count + goals.filter((g) => g.name === playerName).length;
  }, 0);
}

/**
 * Count recent assists for a player
 * @param {string} playerName - Player name
 * @param {Array} matches - Array of match objects
 * @returns {number} Assist count
 */
export function countRecentAssists(playerName, matches) {
  return matches.reduce((count, match) => {
    const assists = match.assists || [];
    return count + assists.filter((a) => a.name === playerName).length;
  }, 0);
}

/**
 * Calculate player form based on events and recent matches
 * @param {Array} playerEvents - Array of player events in current match
 * @param {Array} recentMatches - Array of recent matches
 * @returns {number} Form score
 */
export function calculatePlayerForm(playerEvents, recentMatches = []) {
  let form = 0;
  let matchWeight = 1.0;

  // Calculate form from current match events
  playerEvents.forEach((event) => {
    switch (event.type) {
      case "Goal":
        form += 3 * matchWeight;
        break;
      case "Assist":
        form += 2 * matchWeight;
        break;
      case "Yellow Card":
        form -= 1 * matchWeight;
        break;
      case "Red Card":
        form -= 3 * matchWeight;
        break;
      case "Clean Sheet":
        form += 2 * matchWeight;
        break;
    }
  });

  // Add recent match performance
  recentMatches.forEach((match, index) => {
    const matchWeight = Math.pow(0.85, index); // Exponential decay for older matches
    const events = match.events || [];
    events.forEach((event) => {
      switch (event.type) {
        case "Goal":
          form += 3 * matchWeight;
          break;
        case "Assist":
          form += 2 * matchWeight;
          break;
        case "Yellow Card":
          form -= 1 * matchWeight;
          break;
        case "Red Card":
          form -= 3 * matchWeight;
          break;
        case "Clean Sheet":
          form += 2 * matchWeight;
          break;
      }
    });
  });

  return form;
}

/**
 * Adjust score prediction based on context
 * @param {Array} rawScores - Raw predicted scores [home, away]
 * @param {Object} context - Match context information
 * @returns {Array} Adjusted scores [home, away]
 */
export function adjustScorePrediction(rawScores, context) {
  let [homeGoals, awayGoals] = rawScores.map(Math.round);

  // Adjust based on team form
  const formDiff = context.homeTeamForm - context.awayTeamForm;
  if (Math.abs(formDiff) > 5) {
    const adjustment = Math.floor(Math.abs(formDiff) / 5);
    if (formDiff > 0) {
      homeGoals = Math.max(homeGoals, awayGoals + adjustment);
    } else {
      awayGoals = Math.max(awayGoals, homeGoals + adjustment);
    }
  }

  // Adjust based on h2h history
  const h2h = context.h2hStats;
  if (h2h.totalMatches > 0) {
    const homeWinRate = h2h.homeWins / h2h.totalMatches;
    const awayWinRate = h2h.awayWins / h2h.totalMatches;
    if (Math.abs(homeWinRate - awayWinRate) > 0.3) {
      if (homeWinRate > awayWinRate) {
        homeGoals = Math.max(homeGoals, awayGoals + 1);
      } else {
        awayGoals = Math.max(awayGoals, homeGoals + 1);
      }
    }
  }

  return [homeGoals, awayGoals];
}

/**
 * Predict goal scorers based on probabilities and context
 * @param {Array} probabilities - Array of scorer probabilities
 * @param {Array} playerList - List of all players
 * @param {number} totalGoals - Total predicted goals
 * @param {Object} context - Match context information
 * @returns {Array} Array of predicted scorers
 */
export function predictScorers(probabilities, playerList, totalGoals, context) {
  // Create scorer candidates with context
  const candidates = playerList
    .map((name, index) => {
      const isHome = index < MAX_PLAYERS;
      const playerContext = isHome
        ? context.homePlayers.find((p) => p.name === name)
        : context.awayPlayers.find((p) => p.name === name);

      if (!playerContext || name === "padding") return null;

      return {
        name,
        probability: probabilities[index],
        recentGoals: playerContext.recentGoals,
        form: playerContext.form,
      };
    })
    .filter(Boolean);

  // Sort by combined score (probability + recent form)
  candidates.sort((a, b) => {
    const scoreA = a.probability * 0.6 + a.recentGoals * 0.2 + a.form * 0.2;
    const scoreB = b.probability * 0.6 + b.recentGoals * 0.2 + b.form * 0.2;
    return scoreB - scoreA;
  });

  // Select top scorers based on predicted goals
  return candidates.slice(0, totalGoals).map((c) => c.name);
}

/**
 * Predict goal times based on distribution
 * @param {Array} distribution - Goal time distribution
 * @param {number} numGoals - Number of predicted goals
 * @param {Object} context - Match context information
 * @returns {Array} Array of predicted goal times
 */
export function predictGoalTimes(distribution, numGoals, context) {
  const times = [];
  const usedBins = new Set();

  for (let i = 0; i < numGoals; i++) {
    let bin;
    if (i === 0) {
      // First goal more likely in first 30 minutes
      bin = weightedRandomBin(distribution.slice(0, 2));
    } else if (i === numGoals - 1 && numGoals > 1) {
      // Last goal more likely in last 30 minutes
      bin = weightedRandomBin(distribution.slice(-2));
    } else {
      // Other goals distributed across remaining bins
      bin = weightedRandomBin(distribution);
    }

    // Avoid too many goals in same bin
    while (usedBins.has(bin)) {
      bin = (bin + 1) % GOAL_TIME_BINS;
    }
    usedBins.add(bin);

    // Convert bin to minute
    const minMinute = bin * 15;
    const maxMinute = Math.min(minMinute + 14, 90);
    const minute =
      Math.floor(Math.random() * (maxMinute - minMinute + 1)) + minMinute;
    times.push(`${minute}'`);
  }

  return times.sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * Helper function for weighted random bin selection
 * @param {Array} distribution - Probability distribution
 * @returns {number} Selected bin index
 */
function weightedRandomBin(distribution) {
  const sum = distribution.reduce((a, b) => a + b, 0);
  const normalized = distribution.map((p) => p / sum);
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < normalized.length; i++) {
    cumulative += normalized[i];
    if (random <= cumulative) return i;
  }

  return normalized.length - 1;
}
