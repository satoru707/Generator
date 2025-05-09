import React, { useEffect, useState } from "react";
import { ArrowUpDown, BarChart } from "lucide-react";
import Header from "./components/Header";
import MatchPredictionList from "./components/MatchPredictionList";
import AccuracyChart from "./components/AccuracyChart";

//  npm install @tensorflow/tfjs@4.17.0

function App() {
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("predictions");

  const API_BASE_URL = "http://localhost:3000";
  async function fetchMatches() {
    const response = await fetch(`${API_BASE_URL}/api/matches`);
    if (!response.ok) throw new Error("Failed to fetch matches");
    return await response.json();
  }

  async function fetchPredictionStats() {
    const response = await fetch(`${API_BASE_URL}/api/stats`);
    if (!response.ok) throw new Error("Failed to fetch stats");
    return await response.json();
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const matchesData = await fetchMatches();
        const statsData = await fetchPredictionStats();

        setMatches(matchesData);
        setStats(statsData);
        console.log(matchesData);
        console.log(statsData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // Poll for updates every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case "predictions":
        return <MatchPredictionList matches={matches} loading={loading} />;
      case "accuracy":
        return <AccuracyChart stats={stats} loading={loading} />;
      default:
        return <MatchPredictionList matches={matches} loading={loading} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      {/* Navigation Tabs */}
      <div className="bg-white shadow-sm sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("predictions")}
              className={`px-3 py-4 text-sm font-medium border-b-2 ${
                activeTab === "predictions"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } flex items-center space-x-2 transition-colors duration-200`}
            >
              <ArrowUpDown size={16} />
              <span>Match Predictions</span>
            </button>
            <button
              onClick={() => setActiveTab("accuracy")}
              className={`px-3 py-4 text-sm font-medium border-b-2 ${
                activeTab === "accuracy"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } flex items-center space-x-2 transition-colors duration-200`}
            >
              <BarChart size={16} />
              <span>Prediction Accuracy</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderTabContent()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 text-center">
            Football Match Prediction System for Primera B Metropolitana 2025
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
