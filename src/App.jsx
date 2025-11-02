import React, { useState } from 'react';

// The main component must be named App and exported as default.
// ALL components, logic, and styling must be contained in this one file.

const App = () => {
  const [message, setMessage] = useState("Welcome to the stable single-file React app!");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <script src="https://cdn.tailwindcss.com"></script>
      <div className="w-full max-w-xl bg-white shadow-2xl rounded-xl p-8 text-center border-t-4 border-indigo-500">
        <h1 className="text-4xl font-extrabold text-indigo-700 mb-4">
          Status Check
        </h1>
        
        <p className="text-xl font-medium text-gray-700 mb-8">
          {message}
        </p>

        <p className="text-gray-500 mb-8">
          If you see this message, the single-file structure is working correctly!
        </p>

        <button
          onClick={() => setMessage("The application is running and state is updating!")}
          className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-150 shadow-md transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
        >
          Click to Update State
        </button>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Your application ID: {typeof __app_id !== 'undefined' ? __app_id : 'ID Not Available'}
      </p>
    </div>
  );
};

export default App;
