const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon");

// Get the addon router for serverless environments
const router = getRouter(addonInterface);

// Export default function for Vercel
module.exports = (req, res) => {
    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Log request for debugging
    console.log(`${req.method} ${req.url}`);
    
    // Route the request through Stremio addon router
    router(req, res, function() {
        // 404 handler - called when no route matches
        res.status(404).json({ 
            error: 'Not Found',
            message: 'The requested endpoint was not found',
            availableEndpoints: [
                '/manifest.json',
                '/catalog/{type}/{id}',
                '/stream/{type}/{id}',
                '/meta/{type}/{id}'
            ]
        });
    });
};
