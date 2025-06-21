const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("../addon");

// Get the addon router for serverless environments
const router = getRouter(addonInterface);

// Export function for Vercel serverless
module.exports = function(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }
    
    // Route the request
    router(req, res, function() {
        // 404 handler
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not Found' }));
    });
};
