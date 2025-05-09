import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import LoadingSpinner from "./LoadingSpinner";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const AccuracyChart = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: "Prediction Accuracy by Game Week",
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: "Accuracy (%)",
        },
      },
    },
  };

  const labels = stats.weeklyAccuracy.map((week) => week.week);

  const data = {
    labels,
    datasets: [
      {
        label: "Score Accuracy",
        data: stats.weeklyAccuracy.map((week) => week.scoreAccuracy),
        backgroundColor: "rgba(59, 130, 246, 0.8)",
      },
      {
        label: "Scorer Accuracy",
        data: stats.weeklyAccuracy.map((week) => week.scorerAccuracy),
        backgroundColor: "rgba(16, 185, 129, 0.8)",
      },
      {
        label: "Time Accuracy",
        data: stats.weeklyAccuracy.map((week) => week.timeAccuracy),
        backgroundColor: "rgba(249, 115, 22, 0.8)",
      },
    ],
  };

  return (
    <div className="space-y-8">
      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            Score Prediction
          </h3>
          <div className="flex items-center">
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <path
                  className="stroke-current text-gray-200"
                  fill="none"
                  strokeWidth="4"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="stroke-current text-blue-500"
                  fill="none"
                  strokeWidth="4"
                  strokeDasharray={`${stats.overallAccuracy.score}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                <span className="text-2xl font-bold">
                  {stats.overallAccuracy.score}%
                </span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">
                Overall accuracy for predicting the final score of matches.
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            Scorer Prediction
          </h3>
          <div className="flex items-center">
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <path
                  className="stroke-current text-gray-200"
                  fill="none"
                  strokeWidth="4"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="stroke-current text-green-500"
                  fill="none"
                  strokeWidth="4"
                  strokeDasharray={`${stats.overallAccuracy.scorers}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                <span className="text-2xl font-bold">
                  {stats.overallAccuracy.scorers}%
                </span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">
                Accuracy in predicting which players will score in a match.
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            Time Prediction
          </h3>
          <div className="flex items-center">
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <path
                  className="stroke-current text-gray-200"
                  fill="none"
                  strokeWidth="4"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="stroke-current text-orange-500"
                  fill="none"
                  strokeWidth="4"
                  strokeDasharray={`${stats.overallAccuracy.times}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                <span className="text-2xl font-bold">
                  {stats.overallAccuracy.times}%
                </span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">
                Accuracy in predicting when goals will be scored during matches.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <Bar options={options} data={data} height={300} />
      </div>
    </div>
  );
};

export default AccuracyChart;
