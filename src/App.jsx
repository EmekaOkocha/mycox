import React from 'react';
import { createRoot } from 'react-dom/client';

// -----------------------------------------------------------------------------
// 1. Main Application Component (App)
// -----------------------------------------------------------------------------

/**
 * The main component of the application.
 * All component logic and styling are contained within this single file 
 * to ensure compatibility and eliminate file-resolution errors.
 */
const App = () => {
  const [count, setCount] = React.useState(0);

  return (
    // Use Tailwind CSS classes for responsive, modern styling
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm text-center border-t-4 border-indigo-600">
        
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
          Consolidated React App
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Single-file structure deployed successfully!
        </p>
        
        <div className="space-y-4">
          <p className="text-xl font-medium text-indigo-700">
            Button Clicks: <span className="font-bold text-4xl">{count}</span>
          </p>
          <button
            onClick={() => setCount(c => c + 1)}
            className="w-full py-3 px-6 bg-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:bg-indigo-700 transition duration-300 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50"
          >
            Click Me
          </button>
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// 2. Rendering/Entry Point Logic (Integrated)
// This code mounts the App component to the 'root' element in the host environment.
// -----------------------------------------------------------------------------

// Attempt to find the root container element
const container = document.getElementById('root');

if (container) {
  // Create a root and render the App component
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  // Error logged if the HTML structure is missing the target div
  console.error("Failed to find the root element with ID 'root' in the HTML.");
}
