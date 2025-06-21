const { addonBuilder } = require("stremio-addon-sdk");
const needle = require("needle");

// Addon manifest
const manifest = {
    "id": "org.stremio.vidfast",
    "version": "1.0.0",
    "name": "VidFast Addon",
    "description": "Stremio addon that provides streaming content via VidFast.pro",
    "icon": "https://vidfast.pro/favicon.ico",
    
    // Resources this addon provides
    "resources": [
        "catalog",
        "stream",
        "meta"
    ],
    
    // Content types supported
    "types": ["movie", "series"],
    
    // Catalogs provided by this addon
    "catalogs": [
        {
            type: 'movie',
            id: 'vidfast_movies',
            name: 'VidFast Movies',
            extra: [
                {
                    name: 'search',
                    isRequired: false
                },
                {
                    name: 'skip',
                    isRequired: false
                }
            ]
        },
        {
            type: 'series',
            id: 'vidfast_series', 
            name: 'VidFast TV Shows',
            extra: [
                {
                    name: 'search',
                    isRequired: false
                },
                {
                    name: 'skip',
                    isRequired: false
                }
            ]
        }
    ],
    
    // ID prefixes this addon handles (IMDB and TMDB)
    "idPrefixes": ["tt", "tmdb:"]
};

const builder = new addonBuilder(manifest);

// Helper function to extract IMDB/TMDB ID
function extractId(id) {
    if (id.startsWith('tt')) {
        return id; // IMDB ID
    } else if (id.startsWith('tmdb:')) {
        return id.replace('tmdb:', ''); // TMDB ID
    }
    return id;
}

// Helper function to get content metadata from external API (like TMDB or OMDB)
async function getContentMetadata(id, type) {
    try {
        // For demo purposes, we'll create mock metadata
        // In a real implementation, you'd fetch from TMDB or OMDB API
        const mockData = {
            id: id,
            type: type,
            name: `Content ${id}`,
            poster: `https://images.metahub.space/poster/medium/${id}/img`,
            background: `https://images.metahub.space/background/medium/${id}/img`,
            description: `Content description for ${id}`,
            year: "2023",
            imdbRating: "7.5",
            genre: ["Action", "Drama"]
        };
        
        return mockData;
    } catch (error) {
        console.error('Error fetching metadata:', error);
        return null;
    }
}

// Helper function to construct VidFast embed URL
function getVidFastUrl(id, type, season = null, episode = null) {
    const cleanId = extractId(id);
    
    if (type === 'movie') {
        return `https://vidfast.pro/movie/${cleanId}?autoPlay=true`;
    } else if (type === 'series' && season && episode) {
        return `https://vidfast.pro/tv/${cleanId}/${season}/${episode}?autoPlay=true&nextButton=true&autoNext=true`;
    }
    
    return null;
}

// Stream handler - provides streaming links
builder.defineStreamHandler(async function(args) {
    console.log('Stream request:', args);
    
    try {
        const { type, id } = args;
        
        // For series, extract season and episode from ID
        let season = null;
        let episode = null;
        let baseId = id;
        
        if (type === 'series' && id.includes(':')) {
            const parts = id.split(':');
            baseId = parts[0];
            season = parts[1];
            episode = parts[2];
        }
        
        const vidFastUrl = getVidFastUrl(baseId, type, season, episode);
        
        if (!vidFastUrl) {
            return Promise.resolve({ streams: [] });
        }
        
        // Create stream object
        const stream = {
            name: "VidFast",
            description: "Stream via VidFast.pro",
            url: vidFastUrl,
            title: `VidFast - ${type === 'series' ? `S${season}E${episode}` : 'Movie'}`,
            behaviorHints: {
                bingeGroup: type === 'series' ? `vidfast-${baseId}` : undefined,
                notWebReady: false
            }
        };
        
        return Promise.resolve({ streams: [stream] });
        
    } catch (error) {
        console.error('Stream handler error:', error);
        return Promise.resolve({ streams: [] });
    }
});

// Catalog handler - provides content listings
builder.defineCatalogHandler(async function(args) {
    console.log('Catalog request:', args);
    
    try {
        const { type, id, extra = {} } = args;
        
        // Mock catalog data - in a real implementation, you'd fetch from a content database
        // or API that provides metadata about available content
        const mockCatalog = [];
        
        if (type === 'movie') {
            // Sample movie entries
            const sampleMovies = [
                { id: 'tt6263850', name: 'Batman Forever', year: '1995' },
                { id: 'tt0468569', name: 'The Dark Knight', year: '2008' },
                { id: 'tt1375666', name: 'Inception', year: '2010' },
                { id: '533535', name: 'Deadpool', year: '2016' },
                { id: 'tt0137523', name: 'Fight Club', year: '1999' }
            ];
            
            for (const movie of sampleMovies) {
                mockCatalog.push({
                    id: movie.id,
                    type: 'movie',
                    name: movie.name,
                    poster: `https://images.metahub.space/poster/medium/${movie.id}/img`,
                    year: movie.year
                });
            }
        } else if (type === 'series') {
            // Sample TV series entries
            const sampleSeries = [
                { id: 'tt4052886', name: 'Lucifer', year: '2016' },
                { id: 'tt0903747', name: 'Breaking Bad', year: '2008' },
                { id: '63174', name: 'Game of Thrones', year: '2011' },
                { id: 'tt0944947', name: 'Game of Thrones', year: '2011' },
                { id: 'tt2306299', name: 'Vikings', year: '2013' }
            ];
            
            for (const series of sampleSeries) {
                mockCatalog.push({
                    id: series.id,
                    type: 'series',
                    name: series.name,
                    poster: `https://images.metahub.space/poster/medium/${series.id}/img`,
                    year: series.year
                });
            }
        }
        
        // Handle search
        if (extra.search) {
            const searchTerm = extra.search.toLowerCase();
            const filtered = mockCatalog.filter(item => 
                item.name.toLowerCase().includes(searchTerm)
            );
            return Promise.resolve({ metas: filtered });
        }
        
        // Handle pagination
        const skip = parseInt(extra.skip) || 0;
        const limit = 20;
        const paginatedResults = mockCatalog.slice(skip, skip + limit);
        
        return Promise.resolve({ metas: paginatedResults });
        
    } catch (error) {
        console.error('Catalog handler error:', error);
        return Promise.resolve({ metas: [] });
    }
});

// Meta handler - provides detailed metadata for individual items
builder.defineMetaHandler(async function(args) {
    console.log('Meta request:', args);
    
    try {
        const { type, id } = args;
        
        // Extract base ID for series
        let baseId = id;
        if (type === 'series' && id.includes(':')) {
            baseId = id.split(':')[0];
        }
        
        const metadata = await getContentMetadata(baseId, type);
        
        if (!metadata) {
            return Promise.resolve({ meta: null });
        }
        
        // Build meta object
        const meta = {
            id: baseId,
            type: type,
            name: metadata.name,
            poster: metadata.poster,
            background: metadata.background,
            description: metadata.description,
            year: metadata.year,
            imdbRating: metadata.imdbRating,
            genre: metadata.genre,
            runtime: type === 'movie' ? '120 min' : undefined
        };
        
        // For series, add videos (episodes)
        if (type === 'series') {
            meta.videos = [];
            
            // Mock episode data - in real implementation, fetch from API
            for (let season = 1; season <= 3; season++) {
                for (let episode = 1; episode <= 10; episode++) {
                    meta.videos.push({
                        id: `${baseId}:${season}:${episode}`,
                        title: `Season ${season}, Episode ${episode}`,
                        season: season,
                        episode: episode,
                        released: new Date(2020 + season, 0, episode).toISOString(),
                        thumbnail: `https://images.metahub.space/poster/medium/${baseId}/img`
                    });
                }
            }
        }
        
        return Promise.resolve({ meta: meta });
        
    } catch (error) {
        console.error('Meta handler error:', error);
        return Promise.resolve({ meta: null });
    }
});

module.exports = builder.getInterface();
