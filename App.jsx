import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  addDoc, 
  serverTimestamp,
  doc,
  getDocs,
  getDoc,
  setDoc,
  runTransaction,
  limit,
  orderBy,
} from 'firebase/firestore';
import { 
  User, 
  Lock, 
  BarChart3, 
  LogIn, 
  Search, 
  Star, 
  UserPlus,
  Zap,
  Loader2,
  MapPin,
  Calendar,
  Smile,
  Frown,
  Meh,
  List,
} from 'lucide-react';

// --- Global Variables (Mandatory for Canvas Environment) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'mycox-product-insights';

// --- MVP CONSTANTS ---
const MAX_USERS = 50;
const MAX_REVIEWS_PER_USER = 30;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

const productList = [
    { id: 1, name: 'MyCox Connect Pro', description: 'Real-time state sharing service' },
    { id: 2, name: 'MyCox Edge Functions', description: 'Serverless compute engine' },
    { id: 3, name: 'MyCox Global CDN', description: 'Global content delivery network' },
    { id: 4, name: 'MyCox Deploy System', description: 'Continuous integration system' },
];

const ageRanges = ['<18', '18-24', '25-34', '35-44', '45-54', '55+'];
const regions = ['NA', 'EU', 'AP', 'LATAM'];

// Firestore Path Utilities
const getCollectionPath = (collectionName) => `artifacts/${appId}/public/data/${collectionName}`;
const userLimitDocRef = (db) => doc(db, getCollectionPath('limits'), 'user_count');


// Sentiment and Rating Icons
const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
        case 'Positive': return <Smile className="w-4 h-4 text-green-500" />;
        case 'Neutral': return <Meh className="w-4 h-4 text-yellow-500" />;
        case 'Negative': return <Frown className="w-4 h-4 text-red-500" />;
        default: return <Meh className="w-4 h-4 text-gray-500" />;
    }
};

const getRatingStars = (rating) => {
    return Array(5).fill(0).map((_, i) => (
        <Star 
            key={i} 
            className={`w-4 h-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} 
        />
    ));
};

// --- CRYPTOGRAPHIC HASHING FUNCTION (Client-side simulation of Server-side hashing) ---
// IMPORTANT: In a real Next.js app, this would be done securely in an API Route!
const hashPII = async (name, email) => {
    const piiString = `${name.toLowerCase().trim()}:${email.toLowerCase().trim()}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(piiString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- Sub Components ---

const ReviewCard = React.memo(({ review }) => (
    <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition duration-200">
        <div className="flex justify-between items-start mb-2">
            <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold text-gray-800">{review.product_name}</span>
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex items-center">
                    {getSentimentIcon(review.sentiment)}
                    <span className="ml-1">{review.sentiment}</span>
                </span>
            </div>
            <div className="flex">
                {getRatingStars(review.rating)}
            </div>
        </div>
        <p className="text-sm text-gray-600 italic">"{review.review_text.length > 120 ? review.review_text.substring(0, 120) + '...' : review.review_text}"</p>
        <div className="mt-2 text-xs text-gray-400 flex justify-between">
            <span>Posted: {review.timestamp?.toDate().toLocaleDateString() || 'N/A'}</span>
            <span className="flex items-center space-x-2">
                <span className='flex items-center'><MapPin className='w-3 h-3 mr-0.5' />{review.region}</span>
                <span className='flex items-center'><Calendar className='w-3 h-3 mr-0.5' />{review.age_range}</span>
            </span>
        </div>
    </div>
));


const AdminDashboard = React.memo(({ db, isAdmin }) => {
    const [reviews, setReviews] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !isAdmin) return;
        setIsLoading(true);

        const q = query(
            collection(db, getCollectionPath('product_reviews')),
            orderBy('timestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedReviews = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setReviews(fetchedReviews);
            setIsLoading(false);
        }, (e) => {
            console.error("Error fetching admin data:", e);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [db, isAdmin]);

    // Aggregate Data for Dashboard Metrics
    const aggregatedData = useMemo(() => {
        const data = {
            totalReviews: reviews.length,
            sentiment: { Positive: 0, Neutral: 0, Negative: 0 },
            ageDistribution: {},
            regionDistribution: {},
            avgRating: 0,
        };

        let totalRating = 0;
        const reviewCount = reviews.length;

        reviews.forEach(r => {
            // Sentiment
            if (r.sentiment) data.sentiment[r.sentiment] = (data.sentiment[r.sentiment] || 0) + 1;

            // Age Distribution
            if (r.age_range) data.ageDistribution[r.age_range] = (data.ageDistribution[r.age_range] || 0) + 1;

            // Region Distribution
            if (r.region) data.regionDistribution[r.region] = (data.regionDistribution[r.region] || 0) + 1;

            // Rating
            totalRating += r.rating || 0;
        });

        data.avgRating = reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : 'N/A';

        // Convert distributions to array for mapping
        data.ageDistribution = Object.entries(data.ageDistribution).sort(([a], [b]) => ageRanges.indexOf(a) - ageRanges.indexOf(b));
        data.regionDistribution = Object.entries(data.regionDistribution).sort();

        return data;
    }, [reviews]);

    const MetricCard = ({ title, value, icon, color }) => (
        <div className="bg-white p-4 rounded-xl shadow-lg border-t-4" style={{ borderColor: color }}>
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">{title}</p>
                {icon}
            </div>
            <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
        </div>
    );
    
    const DistributionBar = ({ label, count, total, color = 'bg-indigo-500' }) => {
        const percentage = total > 0 ? (count / total) * 100 : 0;
        return (
            <div className="mb-2">
                <div className="flex justify-between text-sm text-gray-700">
                    <span>{label}</span>
                    <span>{count} ({percentage.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                        className={`h-2 rounded-full transition-all duration-500 ease-out ${color}`} 
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-extrabold text-gray-900 border-b pb-2">Admin Insights Dashboard</h2>

            {/* Top Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard 
                    title="Total Reviews" 
                    value={aggregatedData.totalReviews} 
                    icon={<List className="w-6 h-6 text-indigo-500" />}
                    color="#6366f1"
                />
                <MetricCard 
                    title="Avg. Rating" 
                    value={aggregatedData.avgRating} 
                    icon={<Star className="w-6 h-6 text-yellow-500" />}
                    color="#f59e0b"
                />
                <MetricCard 
                    title="Positive %" 
                    value={aggregatedData.totalReviews > 0 ? ((aggregatedData.sentiment.Positive / aggregatedData.totalReviews) * 100).toFixed(0) + '%' : 'N/A'}
                    icon={<Smile className="w-6 h-6 text-green-500" />}
                    color="#10b981"
                />
                <MetricCard 
                    title="Negative %" 
                    value={aggregatedData.totalReviews > 0 ? ((aggregatedData.sentiment.Negative / aggregatedData.totalReviews) * 100).toFixed(0) + '%' : 'N/A'}
                    icon={<Frown className="w-6 h-6 text-red-500" />}
                    color="#ef4444"
                />
            </div>

            {/* Distribution Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Age Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-lg border">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">Age Range Distribution</h3>
                    {aggregatedData.ageDistribution.map(([range, count]) => (
                        <DistributionBar 
                            key={range} 
                            label={range} 
                            count={count} 
                            total={aggregatedData.totalReviews} 
                            color="bg-purple-500"
                        />
                    ))}
                </div>

                {/* Region Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-lg border">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">Geographic Region (Simulated)</h3>
                    {aggregatedData.regionDistribution.map(([region, count]) => (
                        <DistributionBar 
                            key={region} 
                            label={region} 
                            count={count} 
                            total={aggregatedData.totalReviews} 
                            color="bg-cyan-500"
                        />
                    ))}
                </div>
            </div>

            {/* Latest Reviews (Raw Data) */}
            <div className="bg-white p-6 rounded-xl shadow-lg border">
                <h3 className="text-xl font-semibold mb-4 text-gray-800">Latest User Reviews ({reviews.length})</h3>
                <div className="space-y-3">
                    {reviews.slice(0, 10).map(review => (
                        <div key={review.id} className="p-3 border-b last:border-b-0">
                            <p className="text-sm font-medium text-gray-700">{review.product_name} | Rating: {review.rating}</p>
                            <p className="text-xs text-gray-500 italic">"{review.review_text.substring(0, 80)}..."</p>
                            <p className="text-xs text-indigo-400">Hash ID: {review.hash_id.substring(0, 10)}...</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});


const UserDashboard = React.memo(({ db, userHash, reviews, reviewLimit }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [productSelection, setProductSelection] = useState(null);
    const [newReviewText, setNewReviewText] = useState('');
    const [newReviewRating, setNewReviewRating] = useState(5);
    const [selectedAgeRange, setSelectedAgeRange] = useState(ageRanges[0]);
    const [selectedRegion, setSelectedRegion] = useState(regions[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState(null);

    // Filter reviews based on search term (simulating product search)
    const filteredReviews = useMemo(() => {
        if (!searchTerm) return reviews;
        return reviews.filter(review =>
            review.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            review.review_text.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [reviews, searchTerm]);

    const handleSubmitReview = async (e) => {
        e.preventDefault();
        if (!productSelection || !newReviewText.trim() || !userHash || isSubmitting) return;

        if (reviewLimit >= MAX_REVIEWS_PER_USER) {
            setSubmitMessage({ type: 'error', text: `Review limit reached. Max ${MAX_REVIEWS_PER_USER} reviews.` });
            return;
        }

        setIsSubmitting(true);
        setSubmitMessage(null);

        // Simple sentiment logic for MVP
        const sentiment = newReviewRating >= 4 ? 'Positive' : newReviewRating <= 2 ? 'Negative' : 'Neutral';

        try {
            await addDoc(collection(db, getCollectionPath('product_reviews')), {
                hash_id: userHash,
                product_name: productSelection.name,
                rating: newReviewRating,
                sentiment: sentiment,
                review_text: newReviewText.trim(),
                age_range: selectedAgeRange,
                region: selectedRegion,
                timestamp: serverTimestamp(),
            });

            // Update user review counter (In a real Next.js app, this would be a single transaction on the server)
            const userReviewCountRef = doc(db, getCollectionPath('user_reviews_count'), userHash);
            const userReviewCountSnap = await getDoc(userReviewCountRef);

            await setDoc(userReviewCountRef, { 
                count: (userReviewCountSnap.exists() ? userReviewCountSnap.data().count : 0) + 1 
            }, { merge: true });

            setSubmitMessage({ type: 'success', text: 'Review submitted successfully!' });
            setNewReviewText('');
            setNewReviewRating(5);
            setProductSelection(null);

        } catch (e) {
            console.error("Error submitting review:", e);
            setSubmitMessage({ type: 'error', text: 'Failed to submit review. Try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // Review form section
    const ReviewForm = () => (
        <form onSubmit={handleSubmitReview} className="bg-white p-6 rounded-xl shadow-lg border space-y-4">
            <h3 className="text-xl font-bold text-indigo-600 border-b pb-2 flex items-center">
                <Zap className='w-5 h-5 mr-2' /> Submit Your Insight
            </h3>

            {/* Product Picker (Search Simulation) */}
            <div className='relative'>
                <p className="text-sm font-medium text-gray-700 mb-1">Select Product:</p>
                <button
                    type="button"
                    className="w-full text-left p-3 border border-gray-300 rounded-xl shadow-sm bg-gray-50 flex items-center justify-between"
                    onClick={() => setProductSelection(null)} // Click to reset/open
                >
                    {productSelection ? (
                        <span className="font-semibold text-gray-800">{productSelection.name}</span>
                    ) : (
                        <span className="text-gray-500">Click to select a product...</span>
                    )}
                    <List className='w-4 h-4 text-gray-400' />
                </button>

                {!productSelection && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                        {productList.map(p => (
                            <div 
                                key={p.id} 
                                className="p-3 hover:bg-indigo-50 cursor-pointer text-sm"
                                onClick={() => setProductSelection(p)}
                            >
                                {p.name} - <span className='text-gray-500'>{p.description}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                {/* Age Range */}
                <div>
                    <label className="text-sm font-medium text-gray-700">Age Range (Anonymous)</label>
                    <select 
                        value={selectedAgeRange} 
                        onChange={(e) => setSelectedAgeRange(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 mt-1 shadow-sm"
                    >
                        {ageRanges.map(range => <option key={range} value={range}>{range}</option>)}
                    </select>
                </div>
                {/* Region */}
                <div>
                    <label className="text-sm font-medium text-gray-700">Region (Simulated)</label>
                    <select 
                        value={selectedRegion} 
                        onChange={(e) => setSelectedRegion(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 mt-1 shadow-sm"
                    >
                        {regions.map(region => <option key={region} value={region}>{region}</option>)}
                    </select>
                </div>
            </div>

            {/* Rating */}
            <div>
                <label className="text-sm font-medium text-gray-700 flex justify-between items-center">
                    Rating: {newReviewRating} stars
                    <span className='flex'>{getRatingStars(newReviewRating)}</span>
                </label>
                <input
                    type="range"
                    min="1"
                    max="5"
                    value={newReviewRating}
                    onChange={(e) => setNewReviewRating(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg mt-2"
                />
            </div>

            {/* Review Text */}
            <div>
                <label className="text-sm font-medium text-gray-700">Review Text</label>
                <textarea
                    value={newReviewText}
                    onChange={(e) => setNewReviewText(e.target.value)}
                    placeholder="Tell us what you think..."
                    rows="3"
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 mt-1 shadow-sm"
                />
            </div>
            
            {submitMessage && (
                <div className={`p-3 rounded-lg text-sm ${submitMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {submitMessage.text}
                </div>
            )}

            <button
                type="submit"
                className="w-full flex items-center justify-center px-4 py-3 text-white bg-indigo-600 rounded-xl font-medium hover:bg-indigo-700 transition duration-150 shadow-md disabled:opacity-50"
                disabled={!productSelection || !newReviewText.trim() || isSubmitting || reviewLimit >= MAX_REVIEWS_PER_USER}
            >
                {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                    <Zap className="w-5 h-5 mr-2" />
                )}
                {isSubmitting ? 'Submitting...' : 'Post Review'}
            </button>
            <p className="text-xs text-center text-gray-500 mt-2">
                Your total reviews: {reviewLimit}/{MAX_REVIEWS_PER_USER}. Anonymous ID: {userHash.substring(0, 10)}...
            </p>
        </form>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Review Submission Form (1/3 width) */}
            <div className="lg:col-span-1 space-y-8">
                <ReviewForm />
            </div>

            {/* Latest Reviews List (2/3 width) */}
            <div className="lg:col-span-2">
                <h2 className="text-2xl font-extrabold text-gray-900 border-b pb-2 mb-4">Latest Product Reviews ({filteredReviews.length})</h2>
                
                {/* Search Box */}
                <div className="mb-6 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search products or review text..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-3 pl-10 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                    />
                </div>

                <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
                    {filteredReviews.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">No reviews match your search.</div>
                    ) : (
                        filteredReviews.map(review => (
                            <ReviewCard key={review.id} review={review} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
});


const AuthScreen = React.memo(({ setAuthType, authType, handleAdminLogin, handleUserSignup, handleUserLogin, message, isSubmitting }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [ageRange, setAgeRange] = useState(ageRanges[0]);
    const [username, setUsername] = useState(''); // Used for Admin Login
    const [password, setPassword] = useState(''); // Used for Admin Login
    const [userEmailLogin, setUserEmailLogin] = useState(''); // Used for User Login
    const [userPasswordLogin, setUserPasswordLogin] = useState(''); // Used for User Login

    const onSubmit = (e) => {
        e.preventDefault();
        if (authType === 'admin') {
            handleAdminLogin(username, password);
        } else if (authType === 'signup') {
            handleUserSignup(name, email, ageRange);
        } else if (authType === 'login') {
             // We simulate user login by hashing their credentials and checking against the database.
             // The userPasswordLogin is used as the 'name' in the hash function for a basic identity check.
            handleUserLogin(userEmailLogin, userPasswordLogin);
        }
    };

    const isButtonDisabled = isSubmitting || 
        (authType === 'admin' && (!username.trim() || !password.trim())) ||
        (authType === 'signup' && (!name.trim() || !email.trim())) ||
        (authType === 'login' && (!userEmailLogin.trim() || !userPasswordLogin.trim()));

    const titleMap = {
        login: 'User Login (Demo)',
        signup: 'User Signup (Anonymity First)',
        admin: 'Admin Console Login',
    };

    const buttonMap = {
        login: 'Login with Credentials',
        signup: 'Sign Up & Generate Anonymous ID',
        admin: 'Log In as Admin',
    };

    return (
        <div className="w-full max-w-md">
            <div className="bg-white p-8 rounded-2xl shadow-2xl border border-gray-100">
                <div className="flex justify-center mb-6">
                    <BarChart3 className="w-10 h-10 text-indigo-600" />
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-1">
                    {titleMap[authType]}
                </h2>
                <p className="text-center text-sm text-gray-500 mb-8">
                    {authType === 'signup' && 'Your data is instantly cryptographically hashed.'}
                    {authType === 'admin' && 'Hardcoded credentials: admin / admin'}
                </p>

                {message && (
                    <div className={`p-3 mb-4 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {message.text}
                    </div>
                )}

                <form className="space-y-4" onSubmit={onSubmit}>
                    {authType === 'admin' ? (
                        <>
                            <input
                                type="text"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            />
                        </>
                    ) : authType === 'signup' ? (
                        <>
                            <input
                                type="text"
                                placeholder="Full Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            />
                            <input
                                type="email"
                                placeholder="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            />
                            <select 
                                value={ageRange} 
                                onChange={(e) => setAgeRange(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            >
                                {ageRanges.map(range => <option key={range} value={range}>{range}</option>)}
                            </select>
                            <p className="text-xs text-gray-500 text-center mt-2">
                                NOTE: Name/Email are used *only* to generate your unique, anonymous hash ID.
                            </p>
                        </>
                    ) : ( // User Login (authType === 'login')
                        <>
                            <input
                                type="email"
                                placeholder="Your Signup Email"
                                value={userEmailLogin}
                                onChange={(e) => setUserEmailLogin(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            />
                             <input
                                type="password"
                                placeholder="Your Signup Name (for hash check)"
                                value={userPasswordLogin}
                                onChange={(e) => setUserPasswordLogin(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            />
                            <p className="text-xs text-gray-500 text-center mt-2">
                                Login checks if your anonymous ID exists based on these credentials.
                            </p>
                        </>
                    )}

                    <button
                        type="submit"
                        className="w-full flex items-center justify-center px-4 py-3 text-white bg-indigo-600 rounded-xl font-medium hover:bg-indigo-700 transition duration-150 shadow-lg disabled:opacity-50"
                        disabled={isButtonDisabled}
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        ) : authType === 'admin' ? (
                            <Lock className="w-5 h-5 mr-2" />
                        ) : authType === 'signup' ? (
                            <UserPlus className="w-5 h-5 mr-2" />
                        ) : (
                            <LogIn className="w-5 h-5 mr-2" />
                        )}
                        {isSubmitting ? 'Processing...' : buttonMap[authType]}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center space-x-3">
                    <button onClick={() => setAuthType('login')} className={`text-sm font-medium p-2 rounded-lg ${authType === 'login' ? 'text-indigo-600 bg-indigo-100' : 'text-gray-500 hover:text-indigo-600'}`}>
                        <LogIn className='w-4 h-4 inline mr-1'/> User Login
                    </button>
                    <button onClick={() => setAuthType('signup')} className={`text-sm font-medium p-2 rounded-lg ${authType === 'signup' ? 'text-indigo-600 bg-indigo-100' : 'text-gray-500 hover:text-indigo-600'}`}>
                        <UserPlus className='w-4 h-4 inline mr-1'/> User Signup
                    </button>
                    <button onClick={() => setAuthType('admin')} className={`text-sm font-medium p-2 rounded-lg ${authType === 'admin' ? 'text-indigo-600 bg-indigo-100' : 'text-gray-500 hover:text-indigo-600'}`}>
                        <BarChart3 className='w-4 h-4 inline mr-1'/> Admin
                    </button>
                </div>
            </div>
        </div>
    );
});


// --- Main App Component ---
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [currentUserHash, setCurrentUserHash] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewLimit, setReviewLimit] = useState(0); // Tracks user's reviews
  const [view, setView] = useState('auth'); // 'auth', 'user', 'admin'
  const [authType, setAuthType] = useState('signup'); // 'login', 'signup', 'admin'
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    if (!firebaseConfig) {
      setMessage({ type: 'error', text: 'Firebase configuration is missing.' });
      setLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      
      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (!user) {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (e) {
            console.error("Authentication failed:", e);
            setMessage({ type: 'error', text: "Failed to sign in." });
          }
        }
        if (firebaseAuth.currentUser) {
          setUserId(firebaseAuth.currentUser.uid);
          setLoading(false);
        }
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setMessage({ type: 'error', text: "Failed to initialize Firebase services." });
      setLoading(false);
    }
  }, []);

  // 2. Real-time Data Listener for all reviews (for Dashboard and User feed)
  useEffect(() => {
    if (!db || view === 'auth') return;

    const q = query(
      collection(db, getCollectionPath('product_reviews')),
      orderBy('timestamp', 'desc'),
      limit(30) // Only latest 30 reviews for the public feed
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReviews(fetchedItems);
    }, (e) => {
        console.error("Error fetching review data:", e);
    });

    return () => unsubscribe();
  }, [db, view]);
  
  // 3. Real-time Data Listener for user's review count
  useEffect(() => {
    if (!db || !currentUserHash) return;
    
    const countRef = doc(db, getCollectionPath('user_reviews_count'), currentUserHash);

    const unsubscribe = onSnapshot(countRef, (docSnap) => {
        if (docSnap.exists()) {
            setReviewLimit(docSnap.data().count || 0);
        } else {
            setReviewLimit(0);
        }
    }, (e) => {
        console.error("Error fetching user review count:", e);
    });

    return () => unsubscribe();
  }, [db, currentUserHash]);


  // --- AUTH HANDLERS ---
  
  const clearAuth = () => {
    setCurrentUserHash(null);
    setView('auth');
    setAuthType('signup');
    setMessage(null);
  }

  const handleAdminLogin = (username, password) => {
    setIsSubmitting(true);
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setView('admin');
      setMessage(null);
    } else {
      setMessage({ type: 'error', text: 'Invalid admin credentials.' });
    }
    setIsSubmitting(false);
  };
  
  const handleUserLogin = async (email, name) => {
    setIsSubmitting(true);
    setMessage(null);
    try {
        const hash = await hashPII(name, email);
        const userRef = doc(db, getCollectionPath('users'), hash);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            setCurrentUserHash(hash);
            setView('user');
            setMessage({ type: 'success', text: 'Welcome back! Logged in anonymously.' });
        } else {
            setMessage({ type: 'error', text: 'User hash not found. Please sign up first.' });
        }
    } catch (e) {
        console.error(e);
        setMessage({ type: 'error', text: 'Error during login check.' });
    }
    setIsSubmitting(false);
  }

  const handleUserSignup = async (name, email, ageRange) => {
    setIsSubmitting(true);
    setMessage(null);
    
    // --- SERVERLESS FUNCTION SIMULATION START (Security Boundary) ---
    try {
        const hash = await hashPII(name, email);
        const userRef = doc(db, getCollectionPath('users'), hash);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            setMessage({ type: 'error', text: 'You are already signed up. Please use the login option.' });
            setAuthType('login');
            return;
        }

        // Check user limit using a transaction for atomic update
        await runTransaction(db, async (transaction) => {
            const limitRef = userLimitDocRef(db);
            const limitSnap = await transaction.get(limitRef);
            
            const currentCount = limitSnap.exists() ? limitSnap.data().count : 0;
            
            if (currentCount >= MAX_USERS) {
                throw new Error(`User signup limit of ${MAX_USERS} reached. MVP is full.`);
            }

            // 1. Create the user's anonymous hash entry
            transaction.set(userRef, { hash, ageRange, createdAt: serverTimestamp() });
            
            // 2. Increment the global user count
            transaction.set(limitRef, { count: currentCount + 1 });
        });

        // If transaction succeeds
        setCurrentUserHash(hash);
        setView('user');
        setMessage({ type: 'success', text: 'Signup successful! Your anonymous ID has been created.' });

    } catch (e) {
        console.error("Signup failed:", e);
        if (e.message.includes('User signup limit')) {
             setMessage({ type: 'error', text: e.message });
        } else {
            setMessage({ type: 'error', text: 'Signup failed due to a database error.' });
        }
    } finally {
        setIsSubmitting(false);
    }
    // --- SERVERLESS FUNCTION SIMULATION END ---
  };


  // --- RENDER LOGIC ---

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 font-inter">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="ml-3 text-lg font-medium text-gray-700">Connecting to MyCox Firestore...</p>
      </div>
    );
  }
  
  const Header = () => (
    <div className="flex justify-between items-center mb-8 border-b pb-4">
        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center">
            <BarChart3 className="w-8 h-8 text-indigo-600 mr-2" />
            <span className="text-indigo-600">MyCox</span> Insights Platform
        </h1>
        
        {view !== 'auth' && (
            <button 
                onClick={clearAuth}
                className="flex items-center text-sm font-medium text-red-500 hover:text-red-700 bg-red-50 px-3 py-2 rounded-lg transition duration-150"
            >
                <LogIn className="w-4 h-4 rotate-180 mr-1" /> Logout
            </button>
        )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-8 font-inter">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
        .font-inter { font-family: 'Inter', sans-serif; }
      `}</style>
      
      <div className="w-full max-w-6xl bg-transparent mt-6">
        <Header />
        
        {view === 'auth' && (
          <div className="flex justify-center pt-10">
            <AuthScreen 
                setAuthType={setAuthType}
                authType={authType}
                handleAdminLogin={handleAdminLogin}
                handleUserSignup={handleUserSignup}
                handleUserLogin={handleUserLogin}
                message={message}
                isSubmitting={isSubmitting}
            />
          </div>
        )}

        {view === 'user' && (
            <UserDashboard 
                db={db}
                userHash={currentUserHash}
                reviews={reviews}
                reviewLimit={reviewLimit}
            />
        )}
        
        {view === 'admin' && (
            <AdminDashboard 
                db={db} 
                isAdmin={true}
            />
        )}
      </div>
    </div>
  );
};

export default App;
