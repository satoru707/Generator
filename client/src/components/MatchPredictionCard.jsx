// import React, { useState } from "react";
// import {
//   ChevronDown,
//   ChevronUp,
//   Calendar,
//   Clock,
//   CheckCircle,
//   XCircle,
// } from "lucide-react";

// const MatchPredictionCard = ({ match }) => {
//   const [expanded, setExpanded] = useState(false);

//   const isFutureMatch = !match.score;
//   const dateObj = new Date(match.date);
//   const formattedDate = dateObj.toLocaleDateString("en-US", {
//     year: "numeric",
//     month: "short",
//     day: "numeric",
//   });

//   // Helper function to get color class based on accuracy
//   const getAccuracyColorClass = (accuracy) => {
//     if (accuracy === undefined) return "bg-gray-200 text-gray-700"; // future match
//     if (accuracy >= 70) return "bg-green-100 text-green-800";
//     if (accuracy >= 40) return "bg-orange-100 text-orange-800";
//     return "bg-red-100 text-red-800";
//   };

//   return (
//     <div className="bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg">
//       {/* Card Header */}
//       <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
//         <div className="flex items-center space-x-2">
//           <Calendar size={16} className="text-gray-500" />
//           <span className="text-sm text-gray-600">{formattedDate}</span>
//         </div>
//         {!isFutureMatch && match.accuracy && (
//           <div className="flex items-center space-x-2">
//             <span className="text-sm font-medium">Score Accuracy:</span>
//             <span
//               className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAccuracyColorClass(
//                 match.accuracy.score
//               )}`}
//             >
//               {match.accuracy.score}%
//             </span>
//           </div>
//         )}
//       </div>

//       {/* Teams and Score */}
//       <div className="p-5">
//         <div className="flex justify-between items-center mb-4">
//           <div className="text-lg font-bold text-gray-800">
//             {match.homeTeam}
//           </div>
//           <div className="px-4 py-2 bg-gray-100 rounded-lg font-mono font-bold text-center min-w-20">
//             {isFutureMatch
//               ? match.prediction?.score || "vs"
//               : match.score || "vs"}
//           </div>
//           <div className="text-lg font-bold text-gray-800 text-right">
//             {match.awayTeam}
//           </div>
//         </div>

//         {/* Prediction Section */}
//         {match.prediction && (
//           <div className="mt-4 pt-4 border-t border-gray-100">
//             <div className="flex justify-between items-center mb-2">
//               <h3 className="font-medium text-gray-700">AI Prediction</h3>
//               <button
//                 onClick={() => setExpanded(!expanded)}
//                 className="text-blue-600 hover:text-blue-800 transition-colors flex items-center space-x-1"
//               >
//                 <span className="text-sm">
//                   {expanded ? "Hide Details" : "Show Details"}
//                 </span>
//                 {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
//               </button>
//             </div>

//             {/* Basic Prediction */}
//             <div className="flex justify-between items-center text-sm">
//               <div className="text-gray-600">Predicted Score:</div>
//               <div className="font-semibold">{match.prediction.score}</div>
//             </div>

//             {/* Expanded Details */}
//             {expanded && (
//               <div className="mt-4 space-y-4 animate-fadeIn">
//                 {/* Predicted Scorers */}
//                 <div>
//                   <h4 className="text-sm font-medium text-gray-700 mb-2">
//                     Predicted Scorers:
//                   </h4>
//                   <ul className="space-y-1">
//                     {match.prediction.scorers.map((scorer, index) => {
//                       const time = match.prediction.goalTimes[index] || "?";
//                       const isActual =
//                         !isFutureMatch &&
//                         match.goals?.some((g) => g.name === scorer);

//                       return (
//                         <li
//                           key={`${scorer}-${index}`}
//                           className="flex items-center text-sm"
//                         >
//                           {isActual ? (
//                             <CheckCircle
//                               size={16}
//                               className="text-green-500 mr-2"
//                             />
//                           ) : isFutureMatch ? (
//                             <Clock size={16} className="text-gray-400 mr-2" />
//                           ) : (
//                             <XCircle size={16} className="text-red-500 mr-2" />
//                           )}
//                           <span>{scorer}</span>
//                           <span className="ml-auto text-gray-500">
//                             ~ {time}
//                           </span>
//                         </li>
//                       );
//                     })}
//                   </ul>
//                 </div>

//                 {/* Actual Results (if available) */}
//                 {!isFutureMatch && match.goals && (
//                   <div>
//                     <h4 className="text-sm font-medium text-gray-700 mb-2">
//                       Actual Results:
//                     </h4>
//                     <ul className="space-y-1">
//                       {match.goals.map((goal, index) => (
//                         <li
//                           key={`${goal.name}-${index}`}
//                           className="flex items-center text-sm"
//                         >
//                           <CheckCircle
//                             size={16}
//                             className="text-green-500 mr-2"
//                           />
//                           <span>{goal.name}</span>
//                           <span className="ml-auto text-gray-500">
//                             {goal.minute}
//                           </span>
//                         </li>
//                       ))}
//                     </ul>
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default MatchPredictionCard;

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";

const MatchPredictionCard = ({ match }) => {
  const [expanded, setExpanded] = useState(false);

  const isFutureMatch = !match.score;
  const dateObj = new Date(match.date);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Helper function to get color class based on accuracy
  const getAccuracyColorClass = (accuracy) => {
    if (accuracy === undefined) return "bg-gray-200 text-gray-700"; // future match
    if (accuracy >= 70) return "bg-green-100 text-green-800";
    if (accuracy >= 40) return "bg-orange-100 text-orange-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg">
      {/* Card Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Calendar size={16} className="text-gray-500" />
          <span className="text-sm text-gray-600">{formattedDate}</span>
        </div>
        {!isFutureMatch && match.accuracy && (
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Score Accuracy:</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAccuracyColorClass(
                match.accuracy.score
              )}`}
            >
              {match.accuracy.score}%
            </span>
          </div>
        )}
      </div>

      {/* Teams and Score */}
      <div className="p-5">
        <div className="flex justify-between items-center mb-4">
          <div className="text-lg font-bold text-gray-800">
            {match.homeTeam}
          </div>
          <div className="px-4 py-2 bg-gray-100 rounded-lg font-mono font-bold text-center min-w-20">
            {isFutureMatch ? "TBD" : match.score || "vs"}
          </div>
          <div className="text-lg font-bold text-gray-800 text-right">
            {match.awayTeam}
          </div>
        </div>

        {/* Prediction Section */}
        {match.prediction && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <h3 className="font-medium text-gray-700">AI Prediction</h3>
                {isFutureMatch && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                    Upcoming Match
                  </span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setExpanded(!expanded);
                }}
                className="text-blue-600 hover:text-blue-800 transition-colors flex items-center space-x-1"
              >
                <span className="text-sm">
                  {expanded ? "Hide Details" : "Show Details"}
                </span>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {/* Basic Prediction */}
            <div className="flex justify-between items-center text-sm">
              <div className="text-gray-600">Predicted Score:</div>
              <div className="font-semibold">{match.prediction.score}</div>
            </div>

            {/* Expanded Details */}
            {expanded && (
              <div className="mt-4 space-y-4 animate-fadeIn">
                {/* Predicted Scorers */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Predicted Scorers:
                  </h4>
                  <ul className="space-y-1">
                    {match.prediction.scorers.map((scorer, index) => {
                      const time = match.prediction.goalTimes[index] || "?";
                      const isActual =
                        !isFutureMatch &&
                        match.goals?.some((g) => g.name === scorer);

                      return (
                        <li
                          key={`${scorer}-${index}`}
                          className="flex items-center text-sm"
                        >
                          {isActual ? (
                            <CheckCircle
                              size={16}
                              className="text-green-500 mr-2"
                            />
                          ) : isFutureMatch ? (
                            <Clock size={16} className="text-gray-400 mr-2" />
                          ) : (
                            <XCircle size={16} className="text-red-500 mr-2" />
                          )}
                          <span>{scorer}</span>
                          <span className="ml-auto text-gray-500">
                            ~ {time}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Actual Results (if available) */}
                {!isFutureMatch && match.goals && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Actual Results:
                    </h4>
                    <ul className="space-y-1">
                      {match.goals.map((goal, index) => (
                        <li
                          key={`${goal.name}-${index}`}
                          className="flex items-center text-sm"
                        >
                          <CheckCircle
                            size={16}
                            className="text-green-500 mr-2"
                          />
                          <span>{goal.name}</span>
                          <span className="ml-auto text-gray-500">
                            {goal.minute}'
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchPredictionCard;
