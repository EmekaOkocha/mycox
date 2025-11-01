/**
 * Vercel Serverless Function (Node.js) to securely handle requests to the Gemini API.
 * This proxy prevents exposing the GEMINI_API_KEY to the client-side.
 *
 * File path: api/generate.js
 */

// We use 'gemini-2.5-flash-preview-09-2025' for text generation
const MODEL_NAME = 'gemini-2.5-flash-preview-09-2025';

// Max number of retries for exponential backoff
const MAX_RETRIES = 5;

// The core handler for Vercel Serverless Functions
module.exports = async (req, res) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    // --- 1. Security Check: API Key Retrieval ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY environment variable is not set.");
        return res.status(500).json({ error: 'Server configuration error: Gemini API key missing.' });
    }

    // --- 2. Input Validation and Payload Construction ---
    const { userPrompt, systemPrompt, useSearch } = req.body;

    if (!userPrompt) {
        return res.status(400).json({ error: 'Missing userPrompt in request body.' });
    }

    // Build the base payload
    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
    };

    // Add optional system instruction if provided
    if (systemPrompt) {
        payload.systemInstruction = {
            parts: [{ text: systemPrompt }]
        };
    }

    // Add Google Search grounding if requested
    if (useSearch) {
        payload.tools = [{ "google_search": {} }];
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

    // --- 3. API Call with Exponential Backoff ---
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const fetchResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            // If successful (HTTP 2xx), proceed
            if (fetchResponse.ok) {
                const result = await fetchResponse.json();
                const candidate = result.candidates?.[0];

                if (!candidate || !candidate.content?.parts?.[0]?.text) {
                    // Handle cases where API returns OK but content is empty
                    return res.status(500).json({ error: 'Generated content was empty or malformed.', result });
                }

                const generatedText = candidate.content.parts[0].text;
                let sources = [];

                // Extract grounding sources if they exist
                const groundingMetadata = candidate.groundingMetadata;
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title,
                        }))
                        .filter(source => source.uri && source.title);
                }

                // --- 4. Success Response ---
                return res.status(200).json({
                    text: generatedText,
                    sources: sources,
                });
            }

            // If status is not 2xx, check if it's a retryable error (e.g., 429 Rate Limit, 5xx)
            if (fetchResponse.status === 429 || fetchResponse.status >= 500) {
                console.warn(`Attempt ${attempt + 1}: Retrying due to status ${fetchResponse.status}.`);
                // Calculate exponential backoff delay (2^attempt * 1000 ms)
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                // Non-retryable error (e.g., 400 Bad Request)
                const errorBody = await fetchResponse.json();
                console.error(`Non-retryable API error: ${fetchResponse.status}`, errorBody);
                return res.status(fetchResponse.status).json({
                    error: `API call failed with status ${fetchResponse.status}`,
                    details: errorBody,
                });
            }

        } catch (error) {
            console.error(`Attempt ${attempt + 1}: Fetch error occurred:`, error.message);
            // Treat network/fetch errors as retryable
            if (attempt < MAX_RETRIES - 1) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                return res.status(500).json({ error: 'Failed to connect to the Gemini API after multiple retries.', details: error.message });
            }
        }
    }

    // Should only be reached if all retries failed
    return res.status(500).json({ error: 'All API attempts failed.' });
};
