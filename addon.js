const { addonBuilder } = require("stremio-addon-sdk");
const needle = require("needle");

const manifest = {
    id: "org.stremio.vidfast.v2",
    version: "2.0.0",
    name: "Multi-Provider Addon",
    description: "Stremio addon with multiple streaming providers",
    icon: "https://via.placeholder.com/256x256/ff6b35/ffffff?text=VF",
    resources: ["catalog", "stream", "meta"],
    types: ["movie", "series"],
    catalogs: [
        {
            type: 'movie',
            id: 'vidfast_movies',
            name: 'Multi-Provider Movies',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'vidfast_series',
            name: 'Multi-Providers TV Shows',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        }
    ],
    idPrefixes: ["tt", "tmdb:"],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

const builder = new addonBuilder(manifest);

// Simplified providers that work better with serverless
const PROVIDERS = {
    vidsrcme: {
        name: "VidSrc.me",
        getMovieUrl: (id) => `https://vidsrc.me/embed/movie?imdb=${id}`,
        getSeriesUrl: (id, season, episode) => `https://vidsrc.me/embed/tv?imdb=${id}&season=${season}&episode=${episode}`,
        priority: 1
    },
    vidsrcpro: {
        name: "VidSrc.pro", 
        getMovieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`,
        getSeriesUrl: (id, season, episode) => `https://vidsrc.pro/embed/tv/${id}/${season}/${episode}`,
        priority: 2
    },
    vidsrcto: {
        name: "VidSrc.to",
        getMovieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
        getSeriesUrl: (id, season, episode) => `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`,
        priority: 3
    },
    embedsu: {
        name: "Embed.su",
        getMovieUrl: (id) => `https://embed.su/embed/movie/${id}`,
        getSeriesUrl: (id, season, episode) => `https://embed.su/embed/tv/${id}/${season}/${episode}`,
        priority: 4
    },
    movieapi: {
        name: "MovieAPI",
        getMovieUrl: (id) => `https://movieapi.club/movie/${id}`,
        getSeriesUrl: (id, season, episode) => `https://movieapi.club/tv/${id}-${season}-${episode}`,
        priority: 5
    }
};

// Cache for better performance
const streamCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

function extractId(id) {
    if (id.startsWith('tt')) return id;
    else if (id.startsWith('tmdb:')) return id.replace('tmdb:', '');
    return id;
}

// Try to get direct links through different methods
async function tryExtractDirectLink(embedUrl, providerName) {
    try {
        console.log(`Trying to extract from: ${embedUrl}`);
        
        const options = {
            timeout: 8000,
            follow_max: 3,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.google.com/',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        };

        const response = await needle('get', embedUrl, options);
        
        if (response.statusCode !== 200) {
            console.log(`HTTP ${response.statusCode} for ${embedUrl}`);
            return null;
        }

        const html = response.body;
        if (!html || typeof html !== 'string') return null;

        // Multiple patterns to find video URLs
        const patterns = [
            // M3U8 patterns
            /["']([^"']*\.m3u8[^"']*?)["']/gi,
            /file["']?\s*[:=]\s*["']([^"']*\.m3u8[^"']*?)["']/gi,
            /source["']?\s*[:=]\s*["']([^"']*\.m3u8[^"']*?)["']/gi,
            /url["']?\s*[:=]\s*["']([^"']*\.m3u8[^"']*?)["']/gi,
            
            // MP4 patterns
            /["']([^"']*\.mp4[^"']*?)["']/gi,
            /file["']?\s*[:=]\s*["']([^"']*\.mp4[^"']*?)["']/gi,
            /source["']?\s*[:=]\s*["']([^"']*\.mp4[^"']*?)["']/gi,
            /url["']?\s*[:=]\s*["']([^"']*\.mp4[^"']*?)["']/gi,
            
            // Other video formats
            /["']([^"']*\.(?:webm|mkv|avi)[^"']*?)["']/gi,
            
            // JSON data patterns
            /"file"\s*:\s*"([^"]*\.(?:m3u8|mp4)[^"]*)"/gi,
            /"url"\s*:\s*"([^"]*\.(?:m3u8|mp4)[^"]*)"/gi,
            /"source"\s*:\s*"([^"]*\.(?:m3u8|mp4)[^"]*)"/gi
        ];

        for (const pattern of patterns) {
            const matches = [...html.matchAll(pattern)];
            for (const match of matches) {
                let url = match[1];
                if (!url) continue;
                
                // Clean up the URL
                url = url.trim().replace(/\\"/g, '"').replace(/\\\//g, '/');
                
                // Skip unwanted URLs
                if (url.includes('subtitle') || url.includes('thumb') || 
                    url.includes('poster') || url.includes('logo') ||
                    url.length < 10 || url.length > 2000) continue;
                
                // Make relative URLs absolute
                if (url.startsWith('//')) {
                    url = 'https:' + url;
                } else if (url.startsWith('/')) {
                    const baseUrl = new URL(embedUrl);
                    url = baseUrl.origin + url;
                } else if (!url.startsWith('http')) {
                    continue;
                }
                
                // Validate URL format
                try {
                    new URL(url);
                    if (url.includes('.m3u8') || url.includes('.mp4')) {
                        console.log(`Found potential video URL: ${url}`);
                        return url;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error(`Error extracting from ${embedUrl}:`, error.message);
        return null;
    }
}

async function generateStreams(id, type, season = null, episode = null) {
    const cleanId = extractId(id);
    const cacheKey = `${type}_${cleanId}_${season || ''}_${episode || ''}`;
    
    // Check cache first
    if (streamCache.has(cacheKey)) {
        const cached = streamCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('Returning cached streams for:', cacheKey);
            return cached.streams;
        } else {
            streamCache.delete(cacheKey);
        }
    }

    console.log(`Generating streams for ${type}: ${cleanId}${season && episode ? ` S${season}E${episode}` : ''}`);
    
    const streams = [];
    const extractionPromises = [];

    // Process each provider
    for (const [key, provider] of Object.entries(PROVIDERS)) {
        const promise = (async () => {
            try {
                let embedUrl = null;
                if (type === 'movie') {
                    embedUrl = provider.getMovieUrl(cleanId);
                } else if (type === 'series' && season && episode) {
                    embedUrl = provider.getSeriesUrl(cleanId, season, episode);
                }

                if (!embedUrl) return null;

                // Try to extract direct link
                const directUrl = await tryExtractDirectLink(embedUrl, provider.name);
                
                if (directUrl) {
                    return {
                        name: provider.name,
                        title: `${provider.name} - Direct`,
                        url: directUrl,
                        description: `Direct stream from ${provider.name}`,
                        behaviorHints: {
                            bingeGroup: type === 'series' ? `${key}-${cleanId}` : undefined,
                            notWebReady: false
                        }
                    };
                } else {
                    // Fallback to embed URL
                    return {
                        name: `${provider.name} (Embed)`,
                        title: `${provider.name} - Embed Player`,
                        url: embedUrl,
                        description: `Embed player from ${provider.name}`,
                        behaviorHints: {
                            bingeGroup: type === 'series' ? `${key}-embed-${cleanId}` : undefined,
                            notWebReady: true
                        }
                    };
                }
            } catch (error) {
                console.error(`Error processing ${provider.name}:`, error.message);
                return null;
            }
        })();
        
        extractionPromises.push(promise);
    }

    // Wait for all extractions with timeout
    try {
        const results = await Promise.allSettled(extractionPromises);
        
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                streams.push(result.value);
            }
        });
    } catch (error) {
        console.error('Error in extraction promises:', error);
    }

    // Add some backup streams if no direct links found
    if (streams.filter(s => !s.name.includes('Embed')).length === 0) {
        // Add additional backup providers
        const backupProviders = [
            {
                name: "VidCloud",
                url: type === 'movie' 
                    ? `https://vidcloud.to/embed/movie/${cleanId}`
                    : `https://vidcloud.to/embed/tv/${cleanId}/${season}/${episode}`
            },
            {
                name: "SuperEmbed",
                url: type === 'movie'
                    ? `https://multiembed.mov/directstream.php?video_id=${cleanId}&tmdb=1`
                    : `https://multiembed.mov/directstream.php?video_id=${cleanId}&tmdb=1&s=${season}&e=${episode}`
            }
        ];

        backupProviders.forEach(provider => {
            streams.push({
                name: provider.name,
                title: `${provider.name} - Backup`,
                url: provider.url,
                description: `Backup stream from ${provider.name}`,
                behaviorHints: {
                    bingeGroup: type === 'series' ? `backup-${cleanId}` : undefined,
                    notWebReady: true
                }
            });
        });
    }

    // Sort streams by priority (direct links first)
    streams.sort((a, b) => {
        const aIsDirect = !a.name.includes('Embed') && !a.name.includes('Backup');
        const bIsDirect = !b.name.includes('Embed') && !b.name.includes('Backup');
        
        if (aIsDirect && !bIsDirect) return -1;
        if (!aIsDirect && bIsDirect) return 1;
        
        return 0;
    });

    // Cache the results
    streamCache.set(cacheKey, {
        streams: streams,
        timestamp: Date.now()
    });

    console.log(`Generated ${streams.length} streams for ${cacheKey}`);
    return streams;
}

builder.defineStreamHandler(async function(args) {
    console.log('Stream request:', args);
    try {
        const { type, id } = args;
        let season = null, episode = null, baseId = id;

        if (type === 'series' && id.includes(':')) {
            const parts = id.split(':');
            baseId = parts[0];
            season = parts[1];
            episode = parts[2];
        }

        const streams = await generateStreams(baseId, type, season, episode);
        return Promise.resolve({ streams: streams });
    } catch (error) {
        console.error('Stream handler error:', error);
        return Promise.resolve({ streams: [] });
    }
});

// Enhanced catalog with more content
builder.defineCatalogHandler(async function(args) {
    console.log('Catalog request:', args);
    try {
        const { type, extra = {} } = args;
        const mockCatalog = [];

        if (type === 'movie') {
            const sampleMovies = [
                { id: 'tt6263850', name: 'Batman Forever', year: '1995' },
                { id: 'tt0468569', name: 'The Dark Knight', year: '2008' },
                { id: 'tt1375666', name: 'Inception', year: '2010' },
                { id: 'tt4154756', name: 'Avengers: Endgame', year: '2019' },
                { id: 'tt0137523', name: 'Fight Club', year: '1999' },
                { id: 'tt0111161', name: 'The Shawshank Redemption', year: '1994' },
                { id: 'tt0110912', name: 'Pulp Fiction', year: '1994' },
                { id: 'tt0109830', name: 'Forrest Gump', year: '1994' },
                { id: 'tt0167260', name: 'The Lord of the Rings: The Return of the King', year: '2003' },
                { id: 'tt0120737', name: 'The Lord of the Rings: The Fellowship of the Ring', year: '2001' }
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
            const sampleSeries = [
                { id: 'tt4052886', name: 'Lucifer', year: '2016' },
                { id: 'tt0903747', name: 'Breaking Bad', year: '2008' },
                { id: 'tt0944947', name: 'Game of Thrones', year: '2011' },
                { id: 'tt1475582', name: 'Sherlock', year: '2010' },
                { id: 'tt0108778', name: 'Friends', year: '1994' },
                { id: 'tt5753856', name: 'Dark', year: '2017' },
                { id: 'tt2395695', name: 'Blade Runner: Black Lotus', year: '2021' },
                { id: 'tt2861424', name: 'Rick and Morty', year: '2013' }
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

        if (extra.search) {
            const searchTerm = extra.search.toLowerCase();
            const filtered = mockCatalog.filter(item => 
                item.name.toLowerCase().includes(searchTerm)
            );
            return Promise.resolve({ metas: filtered });
        }

        const skip = parseInt(extra.skip) || 0;
        const limit = 20;
        return Promise.resolve({ metas: mockCatalog.slice(skip, skip + limit) });
    } catch (error) {
        console.error('Catalog handler error:', error);
        return Promise.resolve({ metas: [] });
    }
});

builder.defineMetaHandler(async function(args) {
    console.log('Meta request:', args);
    try {
        const { type, id } = args;
        let baseId = id;
        if (type === 'series' && id.includes(':')) baseId = id.split(':')[0];

        const meta = {
            id: baseId,
            type: type,
            name: `Content ${baseId}`,
            poster: `https://images.metahub.space/poster/medium/${baseId}/img`,
            background: `https://images.metahub.space/background/medium/${baseId}/img`,
            description: `This is the description for ${baseId}. Multiple streaming sources available.`,
            year: "2023",
            imdbRating: "7.5",
            genre: ["Action", "Drama"],
            runtime: type === 'movie' ? '120 min' : undefined
        };

        if (type === 'series') {
            meta.videos = [];
            // Generate more realistic episode structure
            for (let season = 1; season <= 5; season++) {
                const episodeCount = season <= 3 ? 10 : 8; // Varying episode counts
                for (let episode = 1; episode <= episodeCount; episode++) {
                    meta.videos.push({
                        id: `${baseId}:${season}:${episode}`,
                        title: `Season ${season} Episode ${episode}`,
                        season: season,
                        episode: episode,
                        released: new Date(2020 + season, episode - 1, 1).toISOString(),
                        thumbnail: `https://images.metahub.space/poster/medium/${baseId}/img`
                    });
                }
            }
        }

        return Promise.resolve({ meta: meta });
    } catch (error) {
        console.error('Meta handler error:', error);
        return Promise.resolve({ 
            meta: {
                id: id,
                type: type,
                name: 'Unknown Content',
                poster: 'https://via.placeholder.com/300x450/cccccc/ffffff?text=No+Poster'
            }
        });
    }
});

module.exports = builder.getInterface();
