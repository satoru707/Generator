import React from "react";

const LoadingSpinner = () => {
  return (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      <span className="ml-3 text-gray-600">Loading predictions...</span>
    </div>
  );
};

export default LoadingSpinner;
