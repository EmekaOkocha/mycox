import React, { useState, useEffect } from 'react';
import { Search, Loader, Zap } from 'lucide-react';

// --- API Configuration ---
// Note: This model is used for text generation with Google Search grounding.
const MODEL_NAME = 'gemini-2.5-flash-preview-09-2025';
// The API key is automatically provided by the Canvas environment if left empty.
const API_KEY = ""; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
// --- END API Configuration ---

// Helper function to safely parse the streamed content and citations
const parseApiResponse = (data) => {
  const candidate = data.candidates?.[0];
  let generatedText = '';
  let sources = [];

  if (candidate && candidate.content?.parts?.[0]?.text) {
    generatedText = candidate.content.parts[0].text;
  }

  const groundingMetadata = candidate?.groundingMetadata;
  if (groundingMetadata?.groundingAttributions) {
    sources = groundingMetadata.groundingAttributions
      .map(attribution => ({
        uri: attribution.web?.uri,
        title: attribution.web?.title,
      }))
      .filter(source => source.uri && source.title); // Only keep valid sources
  }
  return { generatedText, sources };
};

// Simple hook for exponential backoff retry logic
const useFetchWithBackoff = () => {
    const fetchWithBackoff = async (url, options, maxRetries = 5) => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) {
                    return response;
                }
                // Handle 429 (Rate Limit) explicitly for retries
                if (response.status === 429 && attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                    console.warn(`Rate limit hit, retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                // For other errors (like 404), throw immediately
                throw new Error(`HTTP error! Status: ${response.status}`);

            } catch (error) {
                console.error(`Fetch attempt ${attempt + 1} failed:`, error.message);
                if (attempt === maxRetries - 1) {
                    throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
                }
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    };
    return fetchWithBackoff;
};


// Main App Component
const App = () => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWithBackoff = useFetchWithBackoff();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResponse('');
    setSources([]);

    // System instruction to guide the model's behavior
    const systemPrompt = "You are a helpful and concise research assistant. Answer the user's query by summarizing the grounded information found by Google Search. Cite all sources at the end of the response using [1], [2], etc., corresponding to the provided URLs.";

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        // CRITICAL: Enable Google Search grounding
        tools: [{ "google_search": {} }],
        // Optional: System instruction to guide the model's persona
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    try {
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        const apiResponse = await fetchWithBackoff(API_URL, fetchOptions);
        const data = await apiResponse.json();
        
        if (data.error) {
            throw new Error(data.error.message || "An unknown API error occurred.");
        }

        const { generatedText, sources: newSources } = parseApiResponse(data);

        setResponse(generatedText);
        setSources(newSources);
        
    } catch (err) {
        console.error('API Error:', err);
        setError(`Failed to fetch content: ${err.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const Citation = ({ source, index }) => (
    <a 
      href={source.uri} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="text-indigo-500 hover:text-indigo-700 underline text-sm ml-2 transition-colors duration-200"
    >
      [{index + 1}] {source.title}
    </a>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-8 font-sans">
      <div className="w-full max-w-4xl bg-white shadow-xl rounded-2xl p-6 sm:p-10">
        
        <header className="flex items-center space-x-3 mb-8 border-b pb-4">
          <Zap className="w-8 h-8 text-indigo-600" />
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Gemini Grounded Search
          </h1>
        </header>

        {/* Search Input Form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex rounded-xl shadow-lg border border-gray-200 focus-within:ring-2 focus-within:ring-indigo-500 transition-all duration-300">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are the latest developments in AI large language models?"
              className="flex-grow p-4 text-lg border-none focus:ring-0 rounded-l-xl focus:outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-r-xl transition-all duration-200 disabled:opacity-50 flex items-center justify-center"
            >
              {isLoading ? (
                <Loader className="animate-spin w-6 h-6" />
              ) : (
                <Search className="w-6 h-6" />
              )}
            </button>
          </div>
        </form>

        {/* Results Area */}
        <div className="min-h-[200px] border border-gray-100 rounded-xl p-6 bg-gray-50/50">
          
          {error && (
            <div className="p-4 bg-red-100 text-red-700 rounded-lg border border-red-200">
              <p className="font-medium">Error:</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-indigo-500">
              <Loader className="animate-spin w-8 h-8 mb-3" />
              <p className="text-lg">Searching the web...</p>
            </div>
          )}

          {response && !isLoading && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-800 border-b pb-2">Search Summary</h2>
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{response}</p>

              {sources.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mt-6 mb-3">Sources</h3>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((source, index) => (
                      <Citation key={index} source={source} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!response && !isLoading && !error && (
             <div className="flex items-center justify-center h-full text-gray-400">
                <p>Enter a query and hit search to get real-time, grounded information from the web.</p>
             </div>
          )}

        </div>
      </div>
    </div>
  );
};

// Essential: This is needed to mount the React App in a single-file setup
import * as ReactDOM from 'react-dom/client';
import * as ReactDom from 'react-dom';

// Check if the root element exists before creating the root
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
    // If running in an environment without a predefined root, create one
    const newContainer = document.createElement('div');
    newContainer.id = 'root';
    document.body.appendChild(newContainer);
    const root = ReactDOM.createRoot(newContainer);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
}

export default App;
