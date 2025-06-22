const { addonBuilder } = require("stremio-addon-sdk");
const needle = require("needle");
const puppeteer = require("puppeteer");

const manifest = {
    id: "org.stremio.vidfast",
    version: "1.0.0",
    name: "Multi-Provider Addon",
    description: "Stremio addon with multiple streaming providers",
    icon: "https://vidfast.pro/favicon.ico",
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
            name: 'Multi-Provider TV Shows',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        }
    ],
    idPrefixes: ["tt", "tmdb:"]
};

const builder = new addonBuilder(manifest);

const PROVIDERS = {
    vidfast: {
        name: "VidFast Server",
        baseUrl: "https://vidfast.pro",
        getMovieUrl: (id) => `https://vidfast.pro/movie/${id}?autoPlay=true`,
        getSeriesUrl: (id, season, episode) => `https://vidfast.pro/tv/${id}/${season}/${episode}?autoPlay=true&nextButton=true&autoNext=true`,
        priority: 1,
        extractable: true
    },
    vidsrcme: {
        name: "VidSrc.me",
        baseUrl: "https://vidsrc.me",
        getMovieUrl: (id) => `https://vidsrc.me/embed/movie?imdb=${id}`,
        getSeriesUrl: (id, season, episode) => `https://vidsrc.me/embed/tv?imdb=${id}&season=${season}&episode=${episode}`,
        priority: 2,
        extractable: true
    },
    vidsrcpro: {
        name: "VidSrc.pro",
        baseUrl: "https://vidsrc.pro",
        getMovieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`,
        getSeriesUrl: (id, season, episode) => `https://vidsrc.pro/embed/tv/${id}/${season}/${episode}`,
        priority: 3,
        extractable: true
    },
    // إضافة مصادر مباشرة كـ fallback
    direct: {
        name: "Direct Links",
        priority: 0,
        extractable: false
    }
};

// Cache للروابط المستخرجة لتحسين الأداء
const videoCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 دقيقة

function extractId(id) {
    if (id.startsWith('tt')) return id;
    else if (id.startsWith('tmdb:')) return id.replace('tmdb:', '');
    return id;
}

// دالة استخراج الفيديو من embed URL
async function extractVideoFromEmbed(embedUrl, providerKey) {
    const cacheKey = `${providerKey}_${embedUrl}`;
    
    // فحص الـ cache أولاً
    if (videoCache.has(cacheKey)) {
        const cached = videoCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log('Cache hit for:', embedUrl);
            return cached.url;
        } else {
            videoCache.delete(cacheKey);
        }
    }

    let browser;
    try {
        console.log(`🔍 Extracting video from: ${embedUrl}`);
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding'
            ]
        });

        const page = await browser.newPage();
        
        // تعيين User Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // تعيين timeout أطول
        page.setDefaultTimeout(15000);

        await page.goto(embedUrl, { 
            waitUntil: 'networkidle0',
            timeout: 20000 
        });

        // انتظار تحميل المحتوى
        await page.waitForTimeout(5000);

        // استخراج رابط الفيديو
        const videoUrl = await page.evaluate(() => {
            // البحث في عناصر video
            const videos = document.querySelectorAll('video');
            for (let video of videos) {
                if (video.src && (video.src.includes('.m3u8') || video.src.includes('.mp4'))) {
                    return video.src;
                }
                
                const sources = video.querySelectorAll('source');
                for (let source of sources) {
                    if (source.src && (source.src.includes('.m3u8') || source.src.includes('.mp4'))) {
                        return source.src;
                    }
                }
            }

            // البحث في JavaScript
            const scripts = Array.from(document.scripts);
            for (let script of scripts) {
                const content = script.textContent || script.innerText || '';
                
                // أنماط مختلفة للبحث
                const patterns = [
                    /(https?:\/\/[^\s"'`]+\.m3u8[^\s"'`]*)/gi,
                    /(https?:\/\/[^\s"'`]+\.mp4[^\s"'`]*)/gi,
                    /["']([^"']*\.m3u8[^"']*)["']/gi,
                    /["']([^"']*\.mp4[^"']*)["']/gi,
                    /file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
                    /src\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi
                ];

                for (let pattern of patterns) {
                    const matches = [...content.matchAll(pattern)];
                    for (let match of matches) {
                        let url = match[1] || match[0];
                        url = url.replace(/['"]/g, '');
                        
                        if (url.startsWith('http') && (url.includes('.m3u8') || url.includes('.mp4'))) {
                            return url;
                        }
                    }
                }
            }

            // البحث في متغيرات window
            for (let key in window) {
                try {
                    const value = window[key];
                    if (typeof value === 'string' && 
                        (value.includes('.m3u8') || value.includes('.mp4')) && 
                        value.startsWith('http')) {
                        return value;
                    }
                } catch (e) {
                    // تجاهل الأخطاء
                }
            }

            return null;
        });

        if (videoUrl) {
            // حفظ في الـ cache
            videoCache.set(cacheKey, {
                url: videoUrl,
                timestamp: Date.now()
            });
            
            console.log(`✅ Video extracted: ${videoUrl}`);
            return videoUrl;
        }

        console.log(`❌ No video found in: ${embedUrl}`);
        return null;

    } catch (error) {
        console.error(`❌ Error extracting video from ${embedUrl}:`, error.message);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// دالة الحصول على روابط مباشرة (fallback)
function getDirectLinks(id, type, season = null, episode = null) {
    const directStreams = [];
    
    // روابط مباشرة كمثال (يمكنك إضافة المزيد)
    if (type === 'movie') {
        // يمكنك إضافة APIs أخرى هنا لجلب روابط مباشرة
        directStreams.push({
            name: "Sample Direct Link",
            title: "HD Stream",
            url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4",
            description: "Sample direct MP4 link",
            behaviorHints: { notWebReady: false }
        });
    }
    
    return directStreams;
}

async function generateStreams(id, type, season = null, episode = null) {
    const streams = [];
    const cleanId = extractId(id);

    console.log(`Generating streams for ${type}: ${cleanId}${season && episode ? ` S${season}E${episode}` : ''}`);

    // إضافة روابط مباشرة أولاً
    const directLinks = getDirectLinks(cleanId, type, season, episode);
    streams.push(...directLinks);

    // معالجة كل provider
    const extractionPromises = Object.entries(PROVIDERS).map(async ([key, provider]) => {
        if (!provider.extractable) return null;

        try {
            let embedUrl = null;
            if (type === 'movie') {
                embedUrl = provider.getMovieUrl(cleanId);
            } else if (type === 'series' && season && episode) {
                embedUrl = provider.getSeriesUrl(cleanId, season, episode);
            }

            if (!embedUrl) return null;

            // استخراج الرابط المباشر
            const directUrl = await extractVideoFromEmbed(embedUrl, key);
            
            if (directUrl) {
                return {
                    name: provider.name,
                    description: `Direct stream via ${provider.name}`,
                    url: directUrl,
                    title: `${provider.name} - ${type === 'series' ? `S${season}E${episode}` : 'Movie'}`,
                    behaviorHints: {
                        bingeGroup: type === 'series' ? `${key}-${cleanId}` : undefined,
                        notWebReady: false
                    }
                };
            } else {
                // إذا فشل الاستخراج، أضف الـ embed URL كـ fallback
                return {
                    name: `${provider.name} (Embed)`,
                    description: `Embed player via ${provider.name}`,
                    url: embedUrl,
                    title: `${provider.name} Embed - ${type === 'series' ? `S${season}E${episode}` : 'Movie'}`,
                    behaviorHints: {
                        bingeGroup: type === 'series' ? `${key}-${cleanId}` : undefined,
                        notWebReady: true // Embed URLs are not web-ready
                    }
                };
            }
        } catch (error) {
            console.error(`Error processing ${provider.name}:`, error.message);
            return null;
        }
    });

    // انتظار جميع عمليات الاستخراج
    const extractedStreams = await Promise.all(extractionPromises);
    
    // إضافة الروابط المستخرجة
    extractedStreams.forEach(stream => {
        if (stream) streams.push(stream);
    });

    // ترتيب الروابط حسب الأولوية
    streams.sort((a, b) => {
        const providerA = Object.values(PROVIDERS).find(p => a.name.includes(p.name));
        const providerB = Object.values(PROVIDERS).find(p => b.name.includes(p.name));
        return (providerA?.priority || 999) - (providerB?.priority || 999);
    });

    console.log(`Generated ${streams.length} streams`);
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

// باقي الكود يبقى كما هو...
async function getContentMetadata(id, type) {
    try {
        return {
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
    } catch (error) {
        console.error('Error fetching metadata:', error);
        return null;
    }
}

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
            const sampleSeries = [
                { id: 'tt4052886', name: 'Lucifer', year: '2016' },
                { id: 'tt0903747', name: 'Breaking Bad', year: '2008' },
                { id: 'tt0944947', name: 'Game of Thrones', year: '2011' }
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
            const filtered = mockCatalog.filter(item => item.name.toLowerCase().includes(searchTerm));
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

        const metadata = await getContentMetadata(baseId, type);
        if (!metadata) return Promise.resolve({ meta: null });

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

        if (type === 'series') {
            meta.videos = [];
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
