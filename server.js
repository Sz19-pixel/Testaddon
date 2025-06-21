const { serveHTTP, publishToCentral } = require("stremio-addon-sdk");
const addonInterface = require("./addon");

const PORT = process.env.PORT || 7000;

console.log("Starting VidFast Stremio Addon...");

// Serve the addon via HTTP
serveHTTP(addonInterface, { 
    port: PORT,
    static: "/public" // Serve static files from public directory if needed
});

console.log(`VidFast Addon is running at: http://127.0.0.1:${PORT}/manifest.json`);
console.log(`To install in Stremio, add this URL: http://127.0.0.1:${PORT}/manifest.json`);

// Uncomment the line below if you want to publish to Stremio's central addon collection
// Make sure your addon is publicly accessible via HTTPS before publishing
// publishToCentral("https://your-domain.com/manifest.json");
