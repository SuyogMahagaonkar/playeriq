// ========================================
// PlayerIQ — Express Proxy Server
// ========================================

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { getStreams } from './scrapers/index.js';

// FFmpeg path (winget install location — works without PATH restart)
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

const app = express();
const PORT = 8788;

app.use(cors());
app.use(express.json());

// ---- In-memory cache ----
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Clean old entries
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > CACHE_TTL) cache.delete(k);
    }
  }
}

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cacheSize: cache.size });
});

// ---- Cache management ----
app.get('/api/cache/clear', (req, res) => {
  const size = cache.size;
  cache.clear();
  console.log(`[Cache] Cleared ${size} entries`);
  res.json({ cleared: size, message: 'Cache cleared successfully' });
});

// ---- MovieBox Python Bridge ----
const PYTHON_BRIDGE_URL = 'http://127.0.0.1:8789';

async function getTMDBTitle(type, tmdbId) {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=8e4ad9e56e31ab079517b5be6965b477`;
    const { data } = await axios.get(url, { timeout: 5000 });
    return data.title || data.name || null;
  } catch {
    return null;
  }
}

async function getMovieBoxStream(type, tmdbId, season, episode) {
  try {
    let bridgeUrl;

    // Check if it's a MovieBox-only direct subject_id (prefixed with mb_)
    if (String(tmdbId).startsWith('mb_')) {
      const subjectId = tmdbId.replace('mb_', '');
      bridgeUrl = type === 'movie'
        ? `${PYTHON_BRIDGE_URL}/api/moviebox/stream/movie/${subjectId}`
        : `${PYTHON_BRIDGE_URL}/api/moviebox/stream/tv/${subjectId}/${season}/${episode}`;
    } else {
      // Normal TMDB ID -> resolve title first
      const title = await getTMDBTitle(type === 'movie' ? 'movie' : 'tv', tmdbId);
      if (!title) throw new Error('Could not resolve title from TMDB');
      const encodedTitle = encodeURIComponent(title);
      bridgeUrl = type === 'movie'
        ? `${PYTHON_BRIDGE_URL}/api/moviebox/movie/${encodedTitle}`
        : `${PYTHON_BRIDGE_URL}/api/moviebox/tv/${encodedTitle}/${season}/${episode}`;
    }

    const { data } = await axios.get(bridgeUrl, { timeout: 25000 });
    if (!data.url) throw new Error('MovieBox returned no URL');

    const allStreams = data.all_streams || [];
    
    // Prioritize H.264 streams to avoid client playback issues and VPS CPU overhead.
    const h264Streams = allStreams.filter(s => {
      const codec = s.codec || '';
      return codec.toLowerCase().includes('h264') || codec.toLowerCase().includes('x264');
    });

    let chosenStream = null;
    if (h264Streams.length > 0) {
      // Pick the highest resolution H.264 stream
      chosenStream = h264Streams.reduce((prev, current) => {
        const prevRes = parseInt(prev.resolution) || 0;
        const currentRes = parseInt(current.resolution) || 0;
        return currentRes > prevRes ? current : prev;
      });
      console.log(`[MovieBox] Prioritized H.264 stream: ${chosenStream.resolution}p`);
    } else if (allStreams.length > 0) {
      // No H.264 streams available, fallback to the highest resolution stream (HEVC/H.265)
      chosenStream = allStreams.reduce((prev, current) => {
        const prevRes = parseInt(prev.resolution) || 0;
        const currentRes = parseInt(current.resolution) || 0;
        return currentRes > prevRes ? current : prev;
      });
      console.log(`[MovieBox] Using HEVC/H.265 stream: ${chosenStream.resolution}p`);
    } else {
      // Default fallback
      chosenStream = {
        url: data.url,
        resolution: data.resolution,
        codec: data.codec || 'hevc',
        format: data.format,
        size: data.size,
      };
    }

    // Helper: always route through the range-supporting segment proxy.
    // Do NOT use on-the-fly transcoding on the VPS because H.265 -> H.264 encoding 
    // requires massive CPU which will freeze a shared single-core VPS.
    function makeStreamUrl(rawUrl) {
      if (!rawUrl) return null;
      return `/api/proxy/segment?url=${encodeURIComponent(rawUrl)}&referer=`;
    }

    const totalDuration = data.duration || null;
    return {
      url: makeStreamUrl(chosenStream.url),
      originalUrl: chosenStream.url,
      type: 'mp4',
      provider: 'MovieBox',
      resolution: chosenStream.resolution,
      title: data.title || chosenStream.title,
      codec: chosenStream.codec || 'hevc',
      duration: totalDuration,
      transcoded: false,
      subtitles: [],
      all_streams: allStreams.map(s => ({
        ...s,
        url: makeStreamUrl(s.url),
      })),
    };
  } catch (err) {
    console.warn('[MovieBox Bridge] Failed:', err.message);
    return null;
  }
}

// ---- Content Filtering ----
function isSafeContent(item) {
  if (!item) return false;
  
  // 1. Genre Check (expanded to catch softcore / R18 miscategorizations)
  const badGenres = ['erotica', 'adult', 'softcore', 'porn', 'sensual', '18+'];
  const genreStr = (item.genre || '').toLowerCase();
  for (const bg of badGenres) {
    if (genreStr.includes(bg)) return false;
  }

  // 2. Title & Series Check (Harden SafeSearch against low-budget erotic web series, channels, and platforms)
  // We use precise word boundaries (\b) to target explicit content while ensuring 
  // safe mainstream titles (like "Sex Education" or "Sex and the City") are NOT blocked.
  const titleStr = (item.title || item.name || '').toLowerCase();
  
  const badTitleRegex = /\b(porn|xxx|milf|erotic|erotica|brazzers|nympho|orgasm|incest|18\+|nude|nudity|naked|striptease|kamasutra|seduction|adultery|adult\s?movie|adult\s?show|hentai|fap|slut|bhabhi|bhabi|tharki|mastram|jalebi\s?bai|charmsukh|palang\s?tod|riti\s?riwaj|siskiyan|sursuri|gandii\s?baat|khuli\s?khidki|cuckold|swinger|intercourse|strip\s?club|playboy|sensual\s?desire|hot\s?scene|bedroom\s?scene|unrated\s?version|uncut\s?version|lust|ullu|kooku|nuefliks|hotshots|fliz|rabbit\s?movies|primeplay|neonx|hotmasti|fappot|glowmax|cinemadosti|chikooflix|gupchup|altbalaji|sex\s?movie|sex\s?scene|sex\s?video|sex\s?show|sex\s?tape|hardcore\s?sex|lesbian\s?sex|gay\s?sex|desi\s?hot|desi\s?sexy|desi\s?bhabhi|hot\s?web\s?series|18\+\s?web\s?series|adult\s?web\s?series|uncut\s?web\s?series|unrated\s?web\s?series)\b/i;
  
  // Catch cases where "xxx" might be attached directly to words (like MOMxxx)
  if (titleStr.includes('xxx') || badTitleRegex.test(titleStr)) {
    return false;
  }

  return true;
}

// ---- MovieBox Search (with TMDB cross-reference) ----
// Searches MovieBox first (Hindi/regional content priority), then enriches
// each result with TMDB metadata (rating, overview, poster) matched by title+year.
app.get('/api/moviebox/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const type = req.query.type || 'all';
  const isSafe = req.query.safe !== 'false';
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const cacheKey = `mb-search-${q}-${type}-safe=${isSafe}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Map frontend type codes to Python bridge format
    // Frontend sends: '1' (movie), '2' (TV), 'all'
    // Python bridge expects: 'movie', 'tv', 'all'
    let bridgeType = type;
    if (type === '1') bridgeType = 'movie';
    else if (type === '2') bridgeType = 'tv';

    // 1. Fetch MovieBox results
    const { data: mbData } = await axios.get(
      `${PYTHON_BRIDGE_URL}/api/moviebox/search?q=${encodeURIComponent(q)}&type=${bridgeType}`,
      { timeout: 20000 }
    );
    let mbResults = mbData.results || [];
    
    // Apply SafeSearch if enabled
    if (isSafe) {
      mbResults = mbResults.filter(isSafeContent);
    }
    
    const enriched = mbResults.map(item => {
      // Calculate Lexical Score for Smart Sorting
      const cleanTitle = (item.title || '').replace(/\[.*?\]/g, '').trim();
      const lowerTitle = cleanTitle.toLowerCase();
      const lowerQuery = q.toLowerCase();
      let lexicalScore = 10; // Base score — all MovieBox results are relevant
      if (lowerTitle === lowerQuery) {
        lexicalScore = 100; // Exact match
      } else if (lowerTitle.startsWith(lowerQuery + ' ') || lowerTitle.endsWith(' ' + lowerQuery) || lowerTitle.includes(' ' + lowerQuery + ' ')) {
        lexicalScore = 80; // Word match
      } else if (lowerTitle.includes(lowerQuery)) {
        lexicalScore = 60; // Substring match
      }

      // Also check genre field for category relevance
      const lowerGenre = (item.genre || '').toLowerCase();
      if (lexicalScore < 60 && lowerGenre.includes(lowerQuery)) {
        lexicalScore = 40; // Genre match — relevant to the category
      }

      // Detect Hindi version
      const isHindi = /\[hindi\]/i.test(item.title) || /\[हिंदी\]/i.test(item.title);

      // Normalize field names from Python bridge format to frontend format
      return {
        ...item,
        // Map Python bridge field names → frontend expected names
        id: item.subject_id || item.id || item.subjectId,
        subjectId: item.subject_id || item.subjectId,
        cover: item.cover || (item.cover_url ? { url: item.cover_url } : null),
        poster_path: item.cover_url || item.poster_path || item.cover?.url,
        releaseDate: item.release_date || item.releaseDate,
        imdbRate: item.rating || item.imdbRate,
        subjectType: item.type === 'movie' ? 1 : (item.type === 'tv' ? 2 : undefined),
        is_hindi: isHindi,
        lexicalScore: lexicalScore,
        source: 'moviebox',
        tmdb_id: null
      };
    });

    // 3. Smart Sorting: Lexical match first, then Hindi versions
    enriched.sort((a, b) => {
      if (b.lexicalScore !== a.lexicalScore) return b.lexicalScore - a.lexicalScore;
      if (a.is_hindi && !b.is_hindi) return -1;
      if (!a.is_hindi && b.is_hindi) return 1;
      return 0;
    });

    // 4. Return all results (MovieBox already returns relevant content for the query)
    const result = { results: enriched.slice(0, 30), query: q };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[MovieBox Search]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- MovieBox Native APIs ----
app.get('/api/moviebox/info/:subjectId', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const bridgeUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/info/${subjectId}`;
    const { data } = await axios.get(bridgeUrl, { timeout: 15000 });
    res.json(data);
  } catch (err) {
    console.error('[MovieBox Info]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/moviebox/seasons/:subjectId', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const bridgeUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/seasons/${subjectId}`;
    const { data } = await axios.get(bridgeUrl, { timeout: 15000 });
    res.json(data);
  } catch (err) {
    console.error('[MovieBox Seasons]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/moviebox/home', async (req, res) => {
  try {
    const isSafe = req.query.safe !== 'false';
    const bridgeUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/home`;
    const { data } = await axios.get(bridgeUrl, { timeout: 15000 });
    
    // Apply SafeSearch filter recursively to home data
    if (isSafe && data.items) {
      data.items = data.items.map(row => {
        if (row.subjects) {
          row.subjects = row.subjects.filter(s => isSafeContent(s));
        }
        if (row.customData?.items) {
          row.customData.items = row.customData.items.filter(ci => isSafeContent(ci.subject));
        }
        if (row.banner?.banners) {
          row.banner.banners = row.banner.banners.filter(b => isSafeContent(b.subject));
        }
        return row;
      });
    }

    res.json(data);
  } catch (err) {
    console.error('[MovieBox Home]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- TMDB Enrichment APIs ----
app.get('/api/tmdb/episodes', async (req, res) => {
  try {
    const { title, year, season } = req.query;
    if (!title || !season) return res.status(400).json({ error: 'Missing title or season' });
    
    const apiKey = '8e4ad9e56e31ab079517b5be6965b477';
    
    // Check cache
    const cacheKey = `tmdb-eps-search-${title}-${year}-${season}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // TMDB adult flag (safe default unless explicitly turned off)
    const includeAdult = req.query.safe === 'false' ? 'true' : 'false';

    // 1. Search TMDB for the TV show by title only (MovieBox year often reflects latest season, not first air date)
    let searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(title)}&include_adult=${includeAdult}`;
    let searchRes = await axios.get(searchUrl, { timeout: 10000 });
    let tvResults = searchRes.data.results || [];
    
    // Sort results to prioritize exact name matches to avoid fuzzy matches like "League of Universities: The Athlete Boys"
    tvResults.sort((a, b) => {
      const aExact = a.name.toLowerCase() === title.toLowerCase() ? 1 : 0;
      const bExact = b.name.toLowerCase() === title.toLowerCase() ? 1 : 0;
      return bExact - aExact; // exact matches first
    });
    
    if (tvResults.length === 0) {
      return res.status(404).json({ error: 'TV show not found on TMDB' });
    }
    
    const tmdbId = tvResults[0].id;
    
    // 2. Get season details
    const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${apiKey}`;
    const seasonRes = await axios.get(seasonUrl, { timeout: 10000 });
    
    // 3. Extract episodes
    const episodes = (seasonRes.data.episodes || []).map(ep => ({
      episode_number: ep.episode_number,
      name: ep.name,
      runtime: ep.runtime,
      overview: ep.overview,
      still_path: ep.still_path
    }));
    
    const result = { episodes };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[TMDB Episodes Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- MovieBox Details (Mock TMDB format for PlayerPage) ----
app.get('/api/moviebox/details/movie/:subjectId', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const bridgeUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/stream/movie/${subjectId}`;
    const { data } = await axios.get(bridgeUrl, { timeout: 15000 });

    // Return TMDB-like object
    res.json({
      id: `mb_${subjectId}`,
      title: data.title,
      runtime: data.duration ? Math.floor(data.duration / 60) : 0,
      vote_average: null,
      release_date: '',
      genres: [],
      poster_path: null, // No poster available from this bridge endpoint yet
      backdrop_path: null,
      similar: { results: [] }
    });
  } catch (err) {
    res.status(404).json({ error: 'MovieBox details failed' });
  }
});

app.get('/api/moviebox/details/tv/:subjectId', async (req, res) => {
  try {
    const { subjectId } = req.params;
    // For TV details, we just need basic info. We hit season 1 ep 1 just to get the title.
    const bridgeUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/stream/tv/${subjectId}/1/1`;
    const { data } = await axios.get(bridgeUrl, { timeout: 15000 });

    res.json({
      id: `mb_${subjectId}`,
      name: data.title,
      episode_run_time: data.duration ? [Math.floor(data.duration / 60)] : [],
      vote_average: null,
      first_air_date: '',
      genres: [],
      poster_path: null,
      backdrop_path: null,
      similar: { results: [] },
      seasons: [
        { season_number: 1, episode_count: 1 } // Fake a season so the player loads
      ]
    });
  } catch (err) {
    res.status(404).json({ error: 'MovieBox details failed' });
  }
});

// ---- Stream extraction ----
app.get('/api/stream/movie/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  const cacheKey = `movie-${tmdbId}`;

  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // 1. Try MovieBox Python bridge first (direct .mp4 — best quality)
    const movieBoxResult = await getMovieBoxStream('movie', tmdbId);
    if (movieBoxResult) {
      console.log(`[MovieBox] Success for movie ${tmdbId}: ${movieBoxResult.resolution}p`);
      setCache(cacheKey, movieBoxResult);
      return res.json(movieBoxResult);
    }

    // 2. Fallback: existing scrapers (Nontongo etc.)
    const result = await getStreams('movie', tmdbId);
    if (result) {
      const proxyResult = {
        ...result,
        originalUrl: result.url,
        url: result.type === 'hls'
          ? `/api/proxy/m3u8?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`
          : `/api/proxy/segment?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`,
        subtitles: (result.subtitles || []).map(sub => ({
          ...sub,
          url: `/api/proxy/subtitle?url=${encodeURIComponent(sub.url)}&referer=${encodeURIComponent(result.referer || '')}`,
        })),
      };
      setCache(cacheKey, proxyResult);
      return res.json(proxyResult);
    }
    res.status(404).json({ error: 'No streams found', tmdbId });
  } catch (err) {
    console.error('Stream extraction error:', err);
    res.status(500).json({ error: 'Extraction failed', message: err.message });
  }
});

app.get('/api/stream/tv/:tmdbId/:season/:episode', async (req, res) => {
  const { tmdbId, season, episode } = req.params;
  const cacheKey = `tv-${tmdbId}-${season}-${episode}`;

  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // 1. Try MovieBox Python bridge first
    const movieBoxResult = await getMovieBoxStream('tv', tmdbId, parseInt(season), parseInt(episode));
    if (movieBoxResult) {
      console.log(`[MovieBox] Success for TV ${tmdbId} S${season}E${episode}: ${movieBoxResult.resolution}p`);
      setCache(cacheKey, movieBoxResult);
      return res.json(movieBoxResult);
    }

    // 2. Fallback: existing scrapers
    const result = await getStreams('tv', tmdbId, parseInt(season), parseInt(episode));
    if (result) {
      const proxyResult = {
        ...result,
        originalUrl: result.url,
        url: result.type === 'hls'
          ? `/api/proxy/m3u8?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`
          : `/api/proxy/segment?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`,
        subtitles: (result.subtitles || []).map(sub => ({
          ...sub,
          url: `/api/proxy/subtitle?url=${encodeURIComponent(sub.url)}&referer=${encodeURIComponent(result.referer || '')}`,
        })),
      };
      setCache(cacheKey, proxyResult);
      return res.json(proxyResult);
    }
    res.status(404).json({ error: 'No streams found', tmdbId, season, episode });
  } catch (err) {
    console.error('Stream extraction error:', err);
    res.status(500).json({ error: 'Extraction failed', message: err.message });
  }
});

// ---- M3U8 Proxy ----
// Rewrites segment URLs in the playlist to go through our proxy
app.get('/api/proxy/m3u8', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const { data, headers } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer || '',
        'Origin': referer ? new URL(referer).origin : '',
      },
      responseType: 'text',
      timeout: 15000,
    });

    // Determine base URL for relative paths
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    // Rewrite segment URLs to go through our proxy
    const rewritten = data.replace(/^(?!#)(.+\.(?:ts|m3u8|key|m4s|fmp4|mp4|aac|vtt)(?:\?[^\s]*)?)$/gm, (match) => {
      let absoluteUrl = match.trim();
      if (!absoluteUrl.startsWith('http')) {
        absoluteUrl = baseUrl + absoluteUrl;
      }
      // Route through our proxy
      if (absoluteUrl.endsWith('.m3u8') || absoluteUrl.includes('.m3u8?')) {
        return `/api/proxy/m3u8?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer || '')}`;
      }
      return `/api/proxy/segment?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer || '')}`;
    });

    // Also handle EXT-X-KEY URIs
    const keyRewritten = rewritten.replace(/URI="([^"]+)"/g, (match, uri) => {
      let absoluteUri = uri;
      if (!absoluteUri.startsWith('http')) absoluteUri = baseUrl + absoluteUri;
      return `URI="/api/proxy/segment?url=${encodeURIComponent(absoluteUri)}&referer=${encodeURIComponent(referer || '')}"`;
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(keyRewritten);

  } catch (err) {
    console.error('M3U8 proxy error:', err.message);
    res.status(502).send('Failed to fetch playlist');
  }
});

// ---- Segment/Generic Proxy (Streaming with Range support) ----
app.get('/api/proxy/segment', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    // Forward the Range header from the browser (critical for .mp4 seeking/scrubbing)
    const rangeHeader = req.headers['range'];
    
    // Detailed log to analyze range requests and iPhone behavior
    console.log(`[Segment Proxy] Request for: ${url.substring(0, 60)}... | Range: ${rangeHeader || 'None'}`);

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer || '',
    };
    if (rangeHeader) requestHeaders['Range'] = rangeHeader;

    const response = await axios.get(url, {
      headers: requestHeaders,
      responseType: 'stream',   // Stream — never buffer entire file
      timeout: 30000,
    });

    // Forward status (200 OK or 206 Partial Content for range requests)
    res.status(response.status);

    // Forward all relevant headers
    const forwardHeaders = [
      'content-type', 'content-length', 'content-range',
      'accept-ranges', 'cache-control', 'last-modified', 'etag',
    ];
    forwardHeaders.forEach(h => {
      if (response.headers[h]) res.setHeader(h, response.headers[h]);
    });

    // Force content-type if missing or incorrect
    const currentContentType = res.getHeader('content-type');
    if (!currentContentType || currentContentType === 'application/octet-stream') {
      res.setHeader('content-type', 'video/mp4');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Prevent Nginx from buffering the video stream (critical for iOS Safari Range requests)

    // Pipe the stream directly to the browser — no buffering!
    response.data.pipe(res);

    response.data.on('error', (err) => {
      console.error('Stream pipe error:', err.message);
      if (!res.headersSent) res.status(502).end();
    });

  } catch (err) {
    console.error('Segment proxy error:', err.message);
    if (!res.headersSent) res.status(502).send('Failed to fetch segment');
  }
});

// ---- Subtitle Proxy ----
app.get('/api/proxy/subtitle', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer || '',
      },
      responseType: 'text',
      timeout: 10000,
    });

    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(data);

  } catch (err) {
    console.error('Subtitle proxy error:', err.message);
    res.status(502).send('Failed to fetch subtitle');
  }
});

// ---- FFmpeg HEVC→H.264 Transcoding Proxy ----
// Transcodes H.265/HEVC streams to H.264 on-the-fly using FFmpeg
// Output: fragmented MP4 (fMP4) — browser can start playing immediately
app.get('/api/proxy/transcode', async (req, res) => {
  const { url, referer } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  console.log(`[Transcode] Starting HEVC→H.264 transcode for: ${url.substring(0, 80)}...`);

  // Parse optional start time for seeking (seconds)
  // -ss BEFORE -i = fast input seek (uses keyframes, no full decode)
  const startSeconds = parseFloat(req.query.start || '0') || 0;

  const ffmpegArgs = [
    '-hide_banner', '-loglevel', 'error',
    '-headers', `Referer: ${referer || ''}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`,
    '-analyzeduration', '100000',
    '-probesize', '100000',
    // Seek input BEFORE decoding — very fast, jumps to nearest keyframe
    ...(startSeconds > 0 ? ['-ss', String(startSeconds)] : []),
    '-i', url,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ];

  if (startSeconds > 0) {
    console.log(`[Transcode] Seeking to ${startSeconds}s`);
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // If duration is passed, tell the player the total length upfront
  const duration = req.query.duration;
  if (duration) {
    res.setHeader('X-Video-Duration', duration);
  }

  const ffmpeg = spawn(FFMPEG_PATH, ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Pipe FFmpeg stdout → browser
  ffmpeg.stdout.pipe(res);

  // Log FFmpeg stderr (errors/progress)
  ffmpeg.stderr.on('data', (chunk) => {
    const msg = chunk.toString();
    if (msg.includes('Error') || msg.includes('error')) {
      console.error('[FFmpeg]', msg.trim());
    }
  });

  // Cleanup: kill FFmpeg if client disconnects
  req.on('close', () => {
    console.log('[Transcode] Client disconnected, killing FFmpeg');
    ffmpeg.kill('SIGKILL');
  });

  ffmpeg.on('error', (err) => {
    console.error('[FFmpeg] Spawn error:', err.message);
    if (!res.headersSent) res.status(500).send('FFmpeg not available');
    else res.end();
  });

  ffmpeg.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[FFmpeg] Exited with code ${code}`);
    }
    if (!res.writableEnded) res.end();
  });
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`\n  ⚡ PlayerIQ Proxy Server running at http://localhost:${PORT}`);
  console.log(`  📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`  🎬 Test movie:   http://localhost:${PORT}/api/stream/movie/24428`);
  console.log(`  📺 Test TV:      http://localhost:${PORT}/api/stream/tv/76479/5/5\n`);
});
