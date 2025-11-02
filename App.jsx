import React, { useState } from 'react';
// We must import ReactDOM to mount the application to the browser's DOM.
import ReactDOM from 'react-dom/client'; 

// The main component must be named App and exported as default.
// ALL components, logic, and styling must be contained in this one file.

const App = () => {
  const [message, setMessage] = useState("Welcome! The application is loaded and running from a single file.");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      {/* Tailwind script is placed here for convenience in a single file setup,
        though in a true React environment, it would be configured in the build.
      */}
      <script src="https://cdn.tailwindcss.com"></script>
      <div className="w-full max-w-xl bg-white shadow-2xl rounded-xl p-8 text-center border-t-4 border-indigo-500">
        <h1 className="text-4xl font-extrabold text-indigo-700 mb-4">
          Status Check: Deployed!
        </h1>
        
        <p className="text-xl font-medium text-gray-700 mb-8">
          {message}
        </p>

        <button
          onClick={() => setMessage("The component's state is updating successfully. Ready to build features!")}
          className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-150 shadow-md transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
        >
          Test State Update
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Application ID: {typeof __app_id !== 'undefined' ? __app_id : 'ID Not Available'}
      </p>
    </div>
  );
};

// --- MANDATORY DOM MOUNTING LOGIC ---
// This is what replaces the role of 'react-scripts' and 'index.html' in this single-file setup.
const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(<App />);
} else {
    // Fallback: If 'root' isn't found (which shouldn't happen here), create one.
    const newRoot = document.createElement('div');
    newRoot.id = 'root';
    document.body.appendChild(newRoot);
    ReactDOM.createRoot(newRoot).render(<App />);
}

export default App;
