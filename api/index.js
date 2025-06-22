const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon");

// Get the addon router for serverless environments
const router = getRouter(addonInterface);

// Export default function for Vercel
module.exports = (req, res) => {
    // Set comprehensive CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Add request logging with more details
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    // Add error handling wrapper
    try {
        // Route the request through Stremio addon router
        router(req, res, function() {
            // 404 handler - called when no route matches
            console.log(`404 - Route not found: ${req.method} ${req.url}`);
            res.status(404).json({ 
                error: 'Not Found',
                message: 'The requested endpoint was not found',
                path: req.url,
                method: req.method,
                availableEndpoints: [
                    'GET /manifest.json - Get addon manifest',
                    'GET /catalog/{type}/{id} - Get catalog items',
                    'GET /stream/{type}/{id} - Get stream links',
                    'GET /meta/{type}/{id} - Get metadata'
                ],
                examples: [
                    '/manifest.json',
                    '/catalog/movie/vidfast_movies',
                    '/catalog/series/vidfast_series',
                    '/stream/movie/tt0468569',
                    '/stream/series/tt4052886:1:1',
                    '/meta/movie/tt0468569',
                    '/meta/series/tt4052886'
                ]
            });
        });
    } catch (error) {
        console.error('Router error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An error occurred while processing the request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
