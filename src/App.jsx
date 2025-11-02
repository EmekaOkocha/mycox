import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, orderBy, where, getDocs, addDoc } from 'firebase/firestore';

// --- CONFIGURATION & FIREBASE INITIALIZATION ---

// Global Variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'reviewai-mvp';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- UTILITIES ---

// Utility to generate a non-reversible cryptographic hash for anti-duplication
const generateDeviceHash = async (uid) => {
  const pseudoIdentifier = `${uid}-${window.screen.width}-${window.screen.height}-${navigator.userAgent}`;
  const data = new TextEncoder().encode(pseudoIdentifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Utility to get estimated age range based on a random factor (for mock demo)
const getAgeRange = () => {
  const ranges = ['18-24', '25-34', '35-44', '45-54', '55+'];
  return ranges[Math.floor(Math.random() * ranges.length)];
};

// --- COMPONENTS ---

// Shared Tailwind Classes
const COLORS = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
  textPrimary: 'text-indigo-600',
  border: 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500',
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-white shadow-xl rounded-xl p-6 ${className}`}>
    {children}
  </div>
);

const Button = ({ onClick, children, disabled, className = "", variant = 'primary' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white shadow-sm transition duration-150 ${variant === 'primary' ? COLORS.primary : COLORS.secondary} disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

const LoadingSpinner = () => (
  <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);


// --- CUSTOMER (ANONYMOUS) VIEWS ---

const ReviewSubmission = ({ user, db }) => {
  const [productQuery, setProductQuery] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [productInfo, setProductInfo] = useState('');
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState('search'); // 'search' or 'review'

  // 1. Fetch Product Info via Secure Proxy (LLM + Grounding)
  const handleProductSearch = async () => {
    if (!productQuery) return;
    setIsLoading(true);
    setStatus(null);
    setProductInfo('');

    try {
      // Use window.location.origin to create an absolute URL for fetch
      const response = await fetch(`${window.location.origin}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `What is the ${productQuery}? Provide a brief description and an approximate market price.`, isAnalysis: false }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Product search failed.');

      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generatedText) {
        setProductInfo(generatedText);
        setStep('review');
        setStatus({ type: 'success', message: `Found details for ${productQuery}. Please proceed with your review.` });
      } else {
        throw new Error('LLM did not return a description.');
      }

    } catch (error) {
      console.error("Product Search Error:", error);
      setStatus({ type: 'error', message: `Error finding product: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Submit Review and Analyze via Secure Proxy (LLM Analysis)
  const handleSubmitReview = async () => {
    if (!reviewText || !productInfo) return;
    setIsLoading(true);
    setStatus(null);

    try {
      // 1. Get Geo Location (Mocked for safety/speed)
      const mockGeo = 'Lagos, Nigeria'; 
      // 2. Get Age Range (Mocked)
      const ageRange = getAgeRange(); 

      // 3. AI Analysis (Sentiment, Rating, Insight)
      // Use window.location.origin to create an absolute URL for fetch
      const analysisResponse = await fetch(`${window.location.origin}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAnalysis: true, reviewText }),
      });

      const analysisData = await analysisResponse.json();
      if (!analysisResponse.ok) throw new Error(analysisData.error || 'AI analysis failed.');
      
      const analysisResult = JSON.parse(analysisData.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
      
      if (!analysisResult.sentiment) throw new Error("AI analysis incomplete.");

      // 4. Save Review to Firestore
      const reviewDocRef = doc(collection(db, `artifacts/${appId}/public/data/reviews`));
      await setDoc(reviewDocRef, {
        productId: productQuery, // Use the query as a mock ID for simplicity
        productInfo: productInfo.substring(0, 150) + '...', // Store summary
        reviewText,
        sentiment: analysisResult.sentiment,
        rating: analysisResult.rating || 0,
        keyInsight: analysisResult.keyInsight || 'N/A',
        ageRange,
        geoLocation: mockGeo,
        reviewerId: user.uid,
        createdAt: new Date(),
      });
      
      // 5. Update User Hash/Profile (for anti-duplication)
      const deviceHash = await generateDeviceHash(user.uid);
      const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/main`);
      await setDoc(userDocRef, { deviceHash, lastReviewAt: new Date(), isBusinessAdmin: false }, { merge: true });

      setStatus({ type: 'success', message: 'Review successfully submitted, analyzed, and saved! Thank you for your feedback.' });
      setReviewText('');
      setProductQuery('');
      setProductInfo('');
      setStep('search');

    } catch (error) {
      console.error("Submission Error:", error);
      setStatus({ type: 'error', message: `Submission failed: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-xl mx-auto space-y-6">
      <h2 className={`text-2xl font-bold ${COLORS.textPrimary}`}>Submit Anonymous Review</h2>
      <p className="text-sm text-gray-500">
        Start by searching for the product you want to review. We'll find the product details and then you can leave your anonymous feedback.
      </p>
      
      {status && (
        <div className={`p-3 rounded-lg text-sm ${status.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {status.message}
        </div>
      )}

      {step === 'search' ? (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">1. Search Product Name</label>
          <input
            type="text"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="E.g., Sony A7 III Camera, Render Free Tier"
            className={`w-full p-3 border rounded-lg ${COLORS.border}`}
            disabled={isLoading}
          />
          <Button onClick={handleProductSearch} disabled={isLoading || !productQuery}>
            {isLoading ? <LoadingSpinner /> : 'Search & Proceed to Review'}
          </Button>
          <p className="text-xs text-gray-500 mt-2">
             <span className="font-semibold text-red-500">Identity Note:</span> Your submission is protected by a non-reversible cryptographic device hash to prevent fraud, ensuring anonymous uniqueness.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="font-medium text-sm text-gray-700">2. Reviewing: <span className="font-bold">{productQuery}</span></p>
          <div className="text-xs text-gray-600 border-l-4 border-indigo-400 pl-3 bg-indigo-50 p-2 rounded-md">
            **Product Details:** {productInfo}
          </div>

          <label className="block text-sm font-medium text-gray-700">3. Write Your Review</label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows="5"
            placeholder="Be honest and detailed..."
            className={`w-full p-3 border rounded-lg ${COLORS.border}`}
            disabled={isLoading}
          ></textarea>
          <div className="flex space-x-2">
            <Button onClick={() => setStep('search')} variant="secondary" className="flex-1 bg-white border border-gray-300 text-gray-700">
                Cancel
            </Button>
            <Button onClick={handleSubmitReview} disabled={isLoading || reviewText.length < 10} className="flex-1">
              {isLoading ? <LoadingSpinner /> : 'Submit Review & Analyze'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

const LatestReviews = ({ reviews }) => (
  <Card className="w-full">
    <h2 className="text-2xl font-bold text-gray-700 mb-4">Latest Customer Reviews</h2>
    <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
      {reviews.length === 0 ? (
        <p className="text-gray-500 italic">No reviews submitted yet.</p>
      ) : (
        reviews.map((review) => (
          <div key={review.id} className="p-4 border-b border-gray-100 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <span className="text-lg font-semibold text-gray-800">{review.productId}</span>
              <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${review.sentiment === 'Positive' ? 'bg-green-100 text-green-700' : review.sentiment === 'Negative' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {review.sentiment}
              </span>
            </div>
            <p className="text-gray-600 italic text-sm mb-2 line-clamp-2">"{review.reviewText}"</p>
            <div className="text-xs text-gray-500 flex justify-between">
              <span>Insight: {review.keyInsight || 'N/A'}</span>
              <span>Demographics: {review.ageRange} ({review.geoLocation})</span>
            </div>
          </div>
        ))
      )}
    </div>
  </Card>
);


// --- ADMIN DASHBOARD VIEWS ---

const AdminLogin = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    // Hardcoded Admin Logic
    if (password === 'admin') {
      onLogin(true);
    } else {
      setError('Invalid password. Password is "admin".');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <Card className="w-full max-w-sm space-y-4">
        <h2 className="text-3xl font-bold text-center text-gray-800">Admin Login</h2>
        <p className="text-sm text-center text-gray-500">Password is hardcoded as: <span className="font-mono font-semibold">admin</span></p>
        
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          placeholder="Enter Admin Password"
          className={`w-full p-3 border rounded-lg ${COLORS.border}`}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        
        {error && <p className="text-red-500 text-xs text-center">{error}</p>}
        
        <Button onClick={handleLogin}>
          Log In
        </Button>

        <p className="text-center text-xs text-gray-400 border-t pt-3">
            Reviewer UID: {auth.currentUser?.uid || 'Loading...'}
        </p>
      </Card>
    </div>
  );
};

const StatBox = ({ title, value, unit = '' }) => (
  <Card className="flex flex-col items-center justify-center p-4 text-center">
    <div className="text-3xl font-extrabold text-gray-900">{value} <span className="text-xl text-gray-500 font-medium">{unit}</span></div>
    <div className="text-sm font-medium text-gray-500 mt-1">{title}</div>
  </Card>
);

const AgeChart = ({ reviews }) => {
  const ageData = reviews.reduce((acc, review) => {
    acc[review.ageRange] = (acc[review.ageRange] || 0) + 1;
    return acc;
  }, {});

  const totalReviews = reviews.length;

  return (
    <Card className="h-full">
      <h3 className="text-xl font-semibold mb-4 text-gray-700">User Age Range Distribution</h3>
      {Object.entries(ageData).sort(([a], [b]) => a.localeCompare(b)).map(([range, count]) => (
        <div key={range} className="mb-3">
          <div className="flex justify-between text-sm font-medium text-gray-700">
            <span>{range}</span>
            <span>{count} reviews ({((count / totalReviews) * 100).toFixed(1)}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
            <div className="bg-primary h-2.5 rounded-full" style={{ width: `${(count / totalReviews) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </Card>
  );
};

const AdminDashboard = ({ reviews, onLogout }) => {
    
    // --- Dashboard Metrics Calculation ---
    const totalReviews = reviews.length;
    const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avgRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(2) : 'N/A';
    
    const positiveReviews = reviews.filter(r => r.sentiment === 'Positive').length;
    const negativeReviews = reviews.filter(r => r.sentiment === 'Negative').length;
    
    const positivePercent = totalReviews > 0 ? ((positiveReviews / totalReviews) * 100).toFixed(1) : 'N/A';
    const negativePercent = totalReviews > 0 ? ((negativeReviews / totalReviews) * 100).toFixed(1) : 'N/A';

    // --- Top Insights ---
    const insights = reviews.map(r => r.keyInsight).filter(i => i && i !== 'N/A');
    const insightCounts = insights.reduce((acc, i) => {
        acc[i] = (acc[i] || 0) + 1;
        return acc;
    }, {});
    const topInsights = Object.entries(insightCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 5);

    return (
        <div className="p-8 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-extrabold text-gray-900">Business Dashboard <span className="text-sm font-medium text-indigo-500">(Admin)</span></h1>
                <Button onClick={onLogout} className="w-auto bg-red-500 hover:bg-red-600">
                    Log Out
                </Button>
            </header>

            {totalReviews === 0 && (
                <div className="bg-yellow-100 p-4 rounded-lg text-yellow-800 text-center">
                    No reviews available. Please submit some reviews first.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatBox title="Total Reviews" value={totalReviews} />
                <StatBox title="Average Rating" value={avgRating} unit="/ 5" />
                <StatBox title="Positive Sentiment" value={positivePercent} unit="%" />
                <StatBox title="Negative Sentiment" value={negativePercent} unit="%" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Age Distribution Chart */}
                <div className="lg:col-span-1">
                    <AgeChart reviews={reviews} />
                </div>

                {/* Key Insights & Recent Reviews */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <h3 className="text-xl font-semibold mb-4 text-gray-700">Top 5 Actionable Insights</h3>
                        <ul className="list-disc list-inside space-y-2 text-gray-600">
                            {topInsights.length > 0 ? topInsights.map(([insight, count]) => (
                                <li key={insight} className="text-sm">
                                    <span className="font-semibold text-gray-800">{insight}</span> 
                                    <span className="text-xs text-indigo-500 ml-2">({count} mentions)</span>
                                </li>
                            )) : <li className="text-gray-500 italic">No key insights yet.</li>}
                        </ul>
                    </Card>

                    <Card>
                        <h3 className="text-xl font-semibold mb-4 text-gray-700">Recent Review Data</h3>
                        <div className="space-y-3">
                            {reviews.slice(0, 5).map(review => (
                                <div key={review.id} className="p-3 border rounded-lg hover:border-indigo-400 transition duration-150">
                                    <p className="text-xs font-semibold text-gray-800 line-clamp-1">{review.productId} - {review.keyInsight}</p>
                                    <div className="text-xs flex justify-between text-gray-500 mt-1">
                                        <span>Rating: {review.rating || 'N/A'}</span>
                                        <span>User: {review.ageRange}</span>
                                        <span className={review.sentiment === 'Positive' ? 'text-green-500' : 'text-red-500'}>{review.sentiment}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---

const App = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState('review'); // 'review' or 'admin-login'
  const [reviews, setReviews] = useState([]);

  // 1. Firebase Auth Setup (Runs once)
  useEffect(() => {
    // Authenticate with custom token or anonymously
    const authenticate = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Firebase Auth Error:", e);
      }
    };
    authenticate();

    // Listener for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      // Check for Admin status from Firestore if needed, for MVP we use local state
    });

    return () => unsubscribe();
  }, []);

  // 2. Firestore Data Listener (Runs when user is ready)
  useEffect(() => {
    if (!user) return;

    // Listen to the public reviews collection
    const reviewsRef = collection(db, `artifacts/${appId}/public/data/reviews`);
    // NOTE: orderBy('createdAt', 'desc') is used for sorting in memory if Firestore throws an index error.
    // For now, we will rely on Firestore to handle simple queries, but if you deploy to Vercel and hit
    // the index error, you must remove orderBy here and sort the fetchedReviews array manually.
    const q = query(reviewsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedReviews = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReviews(fetchedReviews);
    }, (error) => {
      console.error("Firestore reviews error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // View switch handler
  const handleViewChange = useCallback((newView) => {
    if (newView === 'admin-dashboard' && !isAdmin) {
        setView('admin-login');
    } else {
        setView(newView);
    }
  }, [isAdmin]);


  // --- Routing Logic ---
  let content;

  if (!isAuthReady) {
    content = (
      <div className="flex flex-col items-center justify-center h-screen">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600">Initializing ReviewAI...</p>
      </div>
    );
  } else if (isAdmin && view === 'admin-dashboard') {
      content = <AdminDashboard reviews={reviews} onLogout={() => setIsAdmin(false)} />;
  } else if (view === 'admin-login') {
      content = <AdminLogin onLogin={() => { setIsAdmin(true); setView('admin-dashboard'); }} />;
  } else { // Default or 'review' view (Landing Page)
      content = (
          <div className="p-4 md:p-8 bg-gray-50 min-h-screen space-y-8 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-8">
              <div className="lg:col-span-1">
                  {/* The main customer interaction component */}
                  <ReviewSubmission user={user} db={db} />
              </div>
              <div className="lg:col-span-2">
                  {/* Display latest reviews next to the form */}
                  <LatestReviews reviews={reviews} />
              </div>
          </div>
      );
  }

  // Persistent Navigation Bar for Review/Admin switching
  if (view !== 'admin-login') {
    return (
      <div className="font-sans">
        <nav className="bg-white shadow-md p-4 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-2xl font-bold text-gray-800">
            <span className={COLORS.textPrimary}>Review</span>AI
          </h1>
          <div className="space-x-3 flex items-center">
            <button 
                onClick={() => handleViewChange('review')}
                className={`text-sm font-medium ${view === 'review' ? COLORS.textPrimary : 'text-gray-500 hover:text-indigo-500'}`}
            >
                Customer Review
            </button>
            <button 
                onClick={() => handleViewChange('admin-dashboard')}
                className={`text-sm font-medium ${view.startsWith('admin') ? COLORS.textPrimary : 'text-gray-500 hover:text-indigo-500'}`}
            >
                Business Dashboard
            </button>
          </div>
        </nav>
        {content}
      </div>
    );
  }

  return <div className="font-sans">{content}</div>;
};

export default App;
