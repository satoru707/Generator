import React from "react";
import MatchPredictionCard from "./MatchPredictionCard";
import LoadingSpinner from "./LoadingSpinner";

const MatchPredictionList = ({ matches, loading }) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  // Group matches by matchday
  const matchesByDay = matches.reduce((acc, match) => {
    if (!acc[match.matchday]) {
      acc[match.matchday] = [];
    }
    acc[match.matchday].push(match);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      {Object.entries(matchesByDay).map(([matchday, dayMatches]) => (
        <div key={matchday} className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 border-b border-gray-200 pb-2">
            {matchday}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {dayMatches.map((match) => (
              <MatchPredictionCard key={match.id} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MatchPredictionList;
