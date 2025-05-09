import React from "react";
import { TrendingUp, BarChart3 } from "lucide-react";

const Header = () => {
  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-800 shadow-md sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <TrendingUp className="text-white" size={24} />
            <h1 className="text-xl font-bold text-white">
              Primera B Metropolitana 2025 Predictions
            </h1>
          </div>
          <div className="flex items-center space-x-2 text-blue-100 bg-blue-700/30 px-3 py-1.5 rounded-full text-sm">
            <BarChart3 size={16} />
            <span>AI Powered Predictions</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
