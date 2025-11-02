import React from 'react';
import { createRoot } from 'react-dom/client';
// Assuming your main component file is now inside the src/ folder
import App from './App.jsx';

/**
 * This is the standard entry point for a React application.
 * It mounts the main 'App' component to the DOM element with the ID 'root'.
 */

// Find the root container element
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
  console.error("Failed to find the root element with ID 'root' in the HTML.");
}
