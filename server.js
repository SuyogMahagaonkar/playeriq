// ========================================
// PlayerIQ — Express Proxy Server
// ========================================

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { getStreams } from './scrapers/index.js';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

// Parse .env manually if it exists (avoids extra dependencies)
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key && !key.startsWith('#')) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.warn('[Env Loader] Failed to load .env file:', e.message);
}

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

// Endpoint for frontend remote logging to PM2
app.post('/api/client-log', (req, res) => {
  const { msg, level } = req.body;
  if (level === 'error') console.error(`[Client Error] ${msg}`);
  else console.log(`[Client Log] ${msg}`);
  res.json({ success: true });
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

async function getTMDBMetadata(type, tmdbId) {
  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=8e4ad9e56e31ab079517b5be6965b477`;
    const { data } = await axios.get(url, { timeout: 5000 });
    const title = data.title || data.name || null;
    const releaseDate = data.release_date || data.first_air_date || '';
    const year = releaseDate ? releaseDate.slice(0, 4) : null;
    return { title, year };
  } catch {
    return null;
  }
}

async function getMovieBoxStream(type, tmdbId, season, episode, hevcSupport = true) {
  try {
    let bridgeUrl;

    // Check if it's a MovieBox-only direct subject_id (prefixed with mb_)
    if (String(tmdbId).startsWith('mb_')) {
      const subjectId = tmdbId.replace('mb_', '');
      bridgeUrl = type === 'movie'
        ? `${PYTHON_BRIDGE_URL}/api/moviebox/stream/movie/${subjectId}`
        : `${PYTHON_BRIDGE_URL}/api/moviebox/stream/tv/${subjectId}/${season}/${episode}`;
    } else {
      // Normal TMDB ID -> resolve title and year first
      const meta = await getTMDBMetadata(type === 'movie' ? 'movie' : 'tv', tmdbId);
      if (!meta || !meta.title) throw new Error('Could not resolve title from TMDB');
      
      // Use the smart matching function to find the correct subject_id
      const match = await findMovieBoxMatch(meta.title, meta.year, type);
      if (!match) throw new Error(`No MovieBox match found for ${meta.title} (${meta.year})`);

      const subjectId = match.subject_id || match.id || match.subjectId;
      bridgeUrl = type === 'movie'
        ? `${PYTHON_BRIDGE_URL}/api/moviebox/stream/movie/${subjectId}`
        : `${PYTHON_BRIDGE_URL}/api/moviebox/stream/tv/${subjectId}/${season}/${episode}`;
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

    // Helper: check if we should transcode locally
    const isChosenHevc = String(chosenStream.codec || '').toLowerCase().includes('hevc') || 
                         String(chosenStream.codec || '').toLowerCase().includes('h265');
    const isTranscodingEnabled = isChosenHevc && !hevcSupport && (process.platform === 'win32');

    // Helper: route through segment or transcode proxy.
    function makeStreamUrl(rawUrl, codec) {
      if (!rawUrl) return null;
      const isHevc = String(codec || '').toLowerCase().includes('hevc') || 
                     String(codec || '').toLowerCase().includes('h265');
      if (isHevc && !hevcSupport) {
        const isLocal = process.platform === 'win32' || process.env.LOCAL_DEV === 'true';
        if (isLocal) {
          console.log('[Stream] Routing HEVC stream through transcode proxy for compatibility');
          return `/api/proxy/transcode?url=${encodeURIComponent(rawUrl)}&referer=`;
        }
      }
      return `/api/proxy/segment?url=${encodeURIComponent(rawUrl)}&referer=`;
    }

    const totalDuration = data.duration || null;
    return {
      url: makeStreamUrl(chosenStream.url, chosenStream.codec),
      originalUrl: chosenStream.url,
      type: 'mp4',
      provider: 'MovieBox',
      resolution: chosenStream.resolution,
      title: data.title || chosenStream.title,
      codec: chosenStream.codec || 'hevc',
      duration: totalDuration,
      transcoded: isTranscodingEnabled,
      subtitles: (data.subtitles || []).map(sub => ({
        label: sub.label || sub.lan || 'Unknown',
        url: `/api/proxy/subtitle?url=${encodeURIComponent(sub.url)}`
      })),
      all_streams: allStreams.map(s => ({
        ...s,
        url: makeStreamUrl(s.url, s.codec),
      })),
    };
  } catch (err) {
    console.warn('[MovieBox Bridge] Failed:', err.message);
    return null;
  }
}

function getTitleFromHomepageJson(subjectId) {
  try {
    const filePath = path.resolve(process.cwd(), 'homepage.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const cleanSubjectId = String(subjectId).trim();
      
      // Try JSON parsing
      const data = JSON.parse(content);
      let foundTitle = null;
      
      function search(obj) {
        if (foundTitle) return;
        if (!obj || typeof obj !== 'object') return;
        
        if (Array.isArray(obj)) {
          for (const item of obj) {
            search(item);
          }
        } else {
          if (String(obj.subjectId) === cleanSubjectId && obj.title) {
            foundTitle = obj.title;
            return;
          }
          for (const key in obj) {
            search(obj[key]);
          }
        }
      }
      
      search(data);
      if (foundTitle) return foundTitle;

      // Regex fallback
      const regex = new RegExp(`"subjectId"\\s*:\\s*"${cleanSubjectId}"[\\s\\S]*?"title"\\s*:\\s*"([^"]+)"`, 'i');
      const match = content.match(regex);
      if (match && match[1]) return match[1];
    }
  } catch (e) {
    console.warn('[Fallback Title Lookup] Failed to search in homepage.json:', e.message);
  }
  return null;
}

// ---- TMDB safety caches and helper functions ----
const TMDB_KEY = '8e4ad9e56e31ab079517b5be6965b477';
const tmdbSafetyCache = new Map(); // TMDB ID -> boolean (isSafe)
const tmdbSearchCache = new Map(); // "type_title_year" -> TMDB ID

async function getTmdbIdForMovieBoxItem(title, year, type) {
  const cleanTitle = (title || '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
  const searchType = type === 'tv' ? 'tv' : 'movie';
  const cleanTitleKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cacheKey = `${searchType}_${cleanTitleKey}_${year || ''}`;
  
  if (tmdbSearchCache.has(cacheKey)) {
    return tmdbSearchCache.get(cacheKey);
  }
  
  try {
    const yearParam = year ? `&${searchType === 'tv' ? 'first_air_date_year' : 'year'}=${year}` : '';
    const url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(cleanTitle)}${yearParam}`;
    const res = await axios.get(url, { timeout: 3000 });
    const results = res.data.results || [];
    if (results.length > 0) {
      const tmdbId = results[0].id;
      tmdbSearchCache.set(cacheKey, tmdbId);
      return tmdbId;
    }
  } catch (err) {
    console.warn(`[TMDB Search ID] Failed for ${title}:`, err.message);
  }
  tmdbSearchCache.set(cacheKey, null);
  return null;
}

async function checkTmdbSafety(tmdbId, type) {
  if (!tmdbId) return true;
  const searchType = type === 'tv' ? 'tv' : 'movie';
  const cacheKey = `${searchType}_${tmdbId}`;
  
  if (tmdbSafetyCache.has(cacheKey)) {
    return tmdbSafetyCache.get(cacheKey);
  }
  
  try {
    const url = `https://api.themoviedb.org/3/${searchType}/${tmdbId}?api_key=${TMDB_KEY}`;
    const res = await axios.get(url, { timeout: 3000 });
    const data = res.data;
    
    const homepage = (data.homepage || '').toLowerCase();
    const networks = (data.networks || []).map(n => (n.name || '').toLowerCase());
    const prodCos = (data.production_companies || []).map(c => (c.name || '').toLowerCase());
    const overview = (data.overview || '').toLowerCase();
    const name = (data.name || data.title || '').toLowerCase();
    
    // Explicit lists
    const explicitStudios = ['ullu', 'kooku', 'primeplay', 'nuefliks', 'hotshots', 'fliz', 'rabbit movies', 'neonx', 'hotmasti', 'fappot', 'glowmax', 'cinemadosti', 'chikooflix', 'gupchup', 'altbalaji', 'vivamax'];
    
    let isSafe = true;
    for (const studio of explicitStudios) {
      if (homepage.includes(studio) || 
          networks.some(n => n.includes(studio)) || 
          prodCos.some(c => c.includes(studio))) {
        isSafe = false;
        break;
      }
    }
    
    if (data.adult === true) {
      isSafe = false;
    }
    
    const explicitTerms = ['ullu', 'kooku', 'nuefliks', 'hotshots', 'fliz', 'rabbit movies', 'primeplay', 'neonx', 'hotmasti', 'fappot', 'glowmax', 'cinemadosti', 'chikooflix', 'gupchup', 'altbalaji', 'vivamax', 'xxx', 'hentai', 'porn', 'adult', 'erotic', 'erotica', 'softcore', 'sensual', '18+'];
    if (isSafe) {
      if (explicitTerms.some(term => name.includes(term) || overview.includes(term))) {
        isSafe = false;
      }
    }
    
    tmdbSafetyCache.set(cacheKey, isSafe);
    return isSafe;
  } catch (err) {
    console.warn(`[Safety Check] Failed to fetch TMDB details for ${type} ${tmdbId}:`, err.message);
    return true; // default to safe on request failure
  }
}

// ---- Content Filtering ----
function isSafeContent(item) {
  if (!item) return false;
  
  // Extract networks and production companies from TMDB structure if present
  const tmdbNetworks = Array.isArray(item.networks)
    ? item.networks.map(n => n.name || n)
    : [];
  const tmdbProdCos = Array.isArray(item.production_companies)
    ? item.production_companies.map(c => c.name || c)
    : [];
  const homepage = item.homepage || '';

  const explicitStudios = ['ullu', 'kooku', 'primeplay', 'nuefliks', 'hotshots', 'fliz', 'rabbit movies', 'neonx', 'hotmasti', 'fappot', 'glowmax', 'cinemadosti', 'chikooflix', 'gupchup', 'altbalaji', 'vivamax'];
  for (const studio of explicitStudios) {
    if (homepage.toLowerCase().includes(studio) ||
        tmdbNetworks.some(n => String(n).toLowerCase().includes(studio)) ||
        tmdbProdCos.some(c => String(c).toLowerCase().includes(studio))) {
      return false;
    }
  }
  
  // Extract additional metadata fields to filter recursively
  const extraFields = [
    item.studio || '',
    item.provider || '',
    item.providerName || '',
    item.publisher || '',
    item.creator || '',
    item.author || '',
    item.tag || '',
    item.tags || '',
    item.source || ''
  ].map(s => String(s).toLowerCase());

  // 1. Genre Check (expanded to catch softcore / R18 / Vivamax / Hentai / JAV / TL Anime miscategorizations)
  const badGenres = ['erotica', 'adult', 'softcore', 'porn', 'sensual', '18+', 'vivamax', 'viva max', 'pinoy softcore', 'tagalog erotic', 'hentai', 'tl anime', 'anime 18+', 'adult anime'];
  const genreStr = (item.genre || '').toLowerCase();
  for (const bg of badGenres) {
    if (genreStr.includes(bg) || extraFields.some(ef => ef.includes(bg))) return false;
  }

  // 2. Text Content Extraction (Title, Name, Description, Overview)
  const titleStr = (item.title || item.name || '').toLowerCase();
  const descStr = (item.description || item.overview || '').toLowerCase();
  
  // Exact Title Blocks (to prevent false positives with generic safe words)
  const exactBlocks = ['romance', 'tl'];
  if (exactBlocks.includes(titleStr)) {
    return false;
  }

  // 3. Foolproof Substring Blocks (No word boundaries needed, absolute explicit matches)
  const badSubstrings = [
    '18+', '18plus', '18 plus', 'r-18', 'r18', 'xxx', 'softcore',
    'porn', 'brazzers', 'nudity', 'striptease', 'kamasutra', 'hentai',
    'bhabhi', 'bhabi', 'tharki', 'mastram', 'jalebi bai', 'charmsukh',
    'palang tod', 'riti riwaj', 'siskiyan', 'sursuri', 'gandii baat',
    'khuli khidki', 'cuckold', 'swinger', 'playboy', 'sensual desire',
    'hot scene', 'bedroom scene', 'unrated version', 'uncut version',
    'ullu', 'kooku', 'nuefliks', 'hotshots', 'fliz', 'rabbit movies',
    'primeplay', 'neonx', 'hotmasti', 'fappot', 'glowmax', 'cinemadosti',
    'chikooflix', 'gupchup', 'altbalaji', 'vivamax', 'viva max', 'jav',
    'sex movie', 'sex scene', 'sex video', 'sex show', 'sex tape',
    'hardcore sex', 'lesbian sex', 'gay sex', 'desi hot', 'desi sexy',
    'desi bhabhi', 'hot web series', '18+ web series', 'adult web series',
    'uncut web series', 'unrated web series', 'teens love',
    'chachi no.1', 'chachi no 1', 'chachi no. 1', 'chachi no'
  ];

  for (const sub of badSubstrings) {
    if (titleStr.includes(sub) || descStr.includes(sub) || genreStr.includes(sub) || extraFields.some(ef => ef.includes(sub))) {
      return false;
    }
  }

  // 4. Regex Word-Boundary Check for other explicit words (to avoid false positives with words like "Sex Education" or "Lust Stories")
  const badTitleRegex = /\b(milf|erotic|erotica|nympho|orgasm|incest|nude|naked|seduction|adultery|adult\s?movie|adult\s?show|fap|slut|lust|eks|seva|sexa|2x1|borders\s?of\s?love|room\s?service|higop|next\s?room\s?affair|cheaters|kuch\s?pal\s?pyar\s?ke|boss\s?ma'am|bula|selina's\s?gold|virgin\s?forest|pamasahe|lulu|siklo|kara\s?cruz|hugot|pantaxa|pabuya|isla|taya|salamat\s?daks|mama\s?katsu|sulutan|kazuko|ala\s?ala|mayank|hatsukoi\s?jikan|seika|papa\s?katsu|kiss\s?&\s?kill|kiss\s?and\s?kill|99\s?moons|female\s?hostel|megane\s?no\s?megami|jalwa|tubero|big\s?and\s?black|trauma|sex\s?weather|you\s?will\s?regret\s?this|date\s?for\s?hire|pihit|city\s?girl|white\s?lily|romance\s?and\s?cegrete|romance\s?&\s?cegrete|nurse\s?abi|isapad|x-deal\s?2|sexy\s?ghotala|kaam\s?sastra|high\s?on\s?sex)\b/i;
  
  if (badTitleRegex.test(titleStr) || badTitleRegex.test(descStr)) {
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
      const safetyChecks = await Promise.all(mbResults.map(async (item) => {
        const itemType = item.type === 'tv' ? 'tv' : 'movie';
        const tmdbId = await getTmdbIdForMovieBoxItem(item.title, item.year || item.release_date, itemType);
        if (tmdbId) {
          return await checkTmdbSafety(tmdbId, itemType);
        }
        return true;
      }));
      mbResults = mbResults.filter((_, idx) => safetyChecks[idx]);
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

// ---- MovieBox Batch Match Endpoint (3G Optimization) ----

function cleanTitleForMatch(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function findMovieBoxMatch(title, year, type) {
  const cleanTitle = (title || '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
  const mbType = type === 'tv' ? 'tv' : 'movie';
  
  // Check memory cache first to avoid duplicate loopback bridge queries
  const cacheKey = `mb-match-${type}-${cleanTitleForMatch(cleanTitle)}-${year || ''}`;
  const cached = getCached(cacheKey);
  if (cached !== null) {
    return cached;
  }

  let searchQueries = [cleanTitle];
  if (year) {
    searchQueries.unshift(`${cleanTitle} ${year}`);
  }
  
  for (const q of searchQueries) {
    try {
      const bridgeUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/search?q=${encodeURIComponent(q)}&type=${mbType}`;
      const { data } = await axios.get(bridgeUrl, { timeout: 10000 });
      const results = data.results || [];
      const cleanedTarget = cleanTitleForMatch(cleanTitle);
      
      // Pass 1: Look for exact title match + close year match (diff <= 2)
      for (const item of results) {
        const cleanedItem = cleanTitleForMatch(item.title);
        const itemYear = (item.release_date || item.year || '').slice(0, 4);
        
        let yearMatches = false;
        if (!year || !itemYear) {
          yearMatches = true;
        } else {
          const y1 = parseInt(year);
          const y2 = parseInt(itemYear);
          yearMatches = !isNaN(y1) && !isNaN(y2) && Math.abs(y1 - y2) <= 2;
        }
        
        if (yearMatches && cleanedTarget === cleanedItem) {
          setCache(cacheKey, item);
          return item;
        }
      }

      // Pass 2: Look for partial title match + close year match (diff <= 2)
      for (const item of results) {
        const cleanedItem = cleanTitleForMatch(item.title);
        const itemYear = (item.release_date || item.year || '').slice(0, 4);
        
        let yearMatches = false;
        if (!year || !itemYear) {
          yearMatches = true;
        } else {
          const y1 = parseInt(year);
          const y2 = parseInt(itemYear);
          yearMatches = !isNaN(y1) && !isNaN(y2) && Math.abs(y1 - y2) <= 2;
        }
        
        if (yearMatches && (cleanedTarget.includes(cleanedItem) || cleanedItem.includes(cleanedTarget))) {
          setCache(cacheKey, item);
          return item;
        }
      }

      // Pass 3: Look for exact title match (even if year differs)
      for (const item of results) {
        const cleanedItem = cleanTitleForMatch(item.title);
        if (cleanedTarget === cleanedItem) {
          setCache(cacheKey, item);
          return item;
        }
      }

    } catch (err) {
      console.warn(`[findMovieBoxMatch server] Failed for query "${q}":`, err.message);
    }
  }
  
  setCache(cacheKey, null);
  return null;
}

app.post('/api/moviebox/match-batch', async (req, res) => {
  const { items, safe } = req.body; // array of { id, title, year, type }
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Missing or invalid items array' });
  }

  try {
    const matches = await Promise.all(items.map(async (item) => {
      if (safe) {
        const isSafe = await checkTmdbSafety(item.id, item.type);
        if (!isSafe) return null;
      }
      const match = await findMovieBoxMatch(item.title, item.year, item.type);
      if (match) {
        return {
          id: item.id,
          subject_id: match.subject_id || match.id || match.subjectId,
          is_hindi: match.title?.toLowerCase().includes('hindi') || match.title?.toLowerCase().includes('हिंदी') || false,
          source: 'moviebox'
        };
      }
      return null;
    }));
    res.json({ matches: matches.filter(Boolean) });
  } catch (err) {
    console.error('[MovieBox Batch Match]', err.message);
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
    
    if (data.items) {
      // 1. Filter out unwanted categories (WWE, Skill & Courses, Cricket, Anime, Hentai, Kids & Learning)
      const unwantedRowRegex = /wwe|skill|course|cricket|anime|hentai|18\+|kids|learning|high-ctr/i;
      data.items = data.items.filter(row => {
        const title = (row.title || '').toLowerCase();
        return !unwantedRowRegex.test(title);
      });

      // 2. Apply SafeSearch filter recursively to remaining home data
      if (isSafe) {
        data.items = await Promise.all(data.items.map(async (row) => {
          if (row.subjects) {
            const safety = await Promise.all(row.subjects.map(async (s) => {
              if (!isSafeContent(s)) return false;
              const type = s.type === 'tv' ? 'tv' : 'movie';
              const tmdbId = await getTmdbIdForMovieBoxItem(s.title, s.year || s.release_date, type);
              if (tmdbId) {
                return await checkTmdbSafety(tmdbId, type);
              }
              return true;
            }));
            row.subjects = row.subjects.filter((_, idx) => safety[idx]);
          }
          if (row.customData?.items) {
            const safety = await Promise.all(row.customData.items.map(async (ci) => {
              const s = ci.subject;
              if (!s || !isSafeContent(s)) return false;
              const type = s.type === 'tv' ? 'tv' : 'movie';
              const tmdbId = await getTmdbIdForMovieBoxItem(s.title, s.year || s.release_date, type);
              if (tmdbId) {
                return await checkTmdbSafety(tmdbId, type);
              }
              return true;
            }));
            row.customData.items = row.customData.items.filter((_, idx) => safety[idx]);
          }
          if (row.banner?.banners) {
            const safety = await Promise.all(row.banner.banners.map(async (b) => {
              const s = b.subject;
              if (!s || !isSafeContent(s)) return false;
              const type = s.type === 'tv' ? 'tv' : 'movie';
              const tmdbId = await getTmdbIdForMovieBoxItem(s.title, s.year || s.release_date, type);
              if (tmdbId) {
                return await checkTmdbSafety(tmdbId, type);
              }
              return true;
            }));
            row.banner.banners = row.banner.banners.filter((_, idx) => safety[idx]);
          }
          return row;
        }));
      }
    }

    res.json(data);
  } catch (err) {
    console.error('[MovieBox Home]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- TMDB Enrichment APIs ----
// ---- TMDB Enrichment APIs ----
app.get('/api/tmdb/episodes', async (req, res) => {
  try {
    const { title, year, season, tvId } = req.query;
    if (!title || !season) return res.status(400).json({ error: 'Missing title or season' });
    
    const apiKey = '8e4ad9e56e31ab079517b5be6965b477';
    
    // Check cache
    const cacheKey = `tmdb-eps-search-${title}-${year}-${season}-${tvId || ''}`;
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
    
    let episodes = [];
    let tmdbSeasonToFetch = parseInt(season);
    let isAbsoluteMapping = false;
    let offset = 0;

    // Check if season exists in TMDB's TV details first
    const tvUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}`;
    const tvRes = await axios.get(tvUrl, { timeout: 10000 });
    const tvDetails = tvRes.data;
    const hasSeason = (tvDetails.seasons || []).some(s => s.season_number === parseInt(season));

    if (!hasSeason && parseInt(season) > 1) {
      // TMDB doesn't have this season, but it's a high season number.
      // Let's check if Season 1 exists and has a lot of episodes
      const s1 = (tvDetails.seasons || []).find(s => s.season_number === 1);
      if (s1 && s1.episode_count > 100) {
        tmdbSeasonToFetch = 1;
        isAbsoluteMapping = true;
        
        // Calculate offset
        if (tvId) {
          const subjectId = String(tvId).replace('mb_', '');
          try {
            const port = process.env.PORT || 3000;
            const mbSeasonsRes = await axios.get(`http://localhost:${port}/api/moviebox/seasons/${subjectId}`, { timeout: 5000 });
            const mbSeasons = mbSeasonsRes.data.seasons || [];
            mbSeasons.sort((a, b) => a.se - b.se);
            for (const s of mbSeasons) {
              if (s.se < parseInt(season)) {
                offset += s.maxEp || 52;
              }
            }
          } catch (e) {
            offset = (parseInt(season) - 1) * 52;
          }
        } else {
          offset = (parseInt(season) - 1) * 52;
        }
      }
    }

    // Now fetch TMDB season
    const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${tmdbSeasonToFetch}?api_key=${apiKey}`;
    const seasonRes = await axios.get(seasonUrl, { timeout: 10000 });
    const tmdbEpisodes = seasonRes.data.episodes || [];

    // Get the maximum released episodes from MovieBox for this season if it's a MovieBox ID
    let movieBoxMaxEp = null;
    if (tvId && String(tvId).startsWith('mb_')) {
      const subjectId = String(tvId).replace('mb_', '');
      try {
        const port = process.env.PORT || PORT || 3000;
        const mbSeasonsRes = await axios.get(`http://localhost:${port}/api/moviebox/seasons/${subjectId}`, { timeout: 5000 });
        const mbSeasons = mbSeasonsRes.data.seasons || [];
        const currentMbSeason = mbSeasons.find(s => s.se === parseInt(season));
        if (currentMbSeason) {
          movieBoxMaxEp = currentMbSeason.maxEp || 0;
        }
      } catch (e) {
        console.warn(`[TMDB Episodes] Failed to fetch MovieBox seasons for ${subjectId}:`, e.message);
      }
    }

    if (isAbsoluteMapping) {
      // Map MovieBox episode numbers to absolute episode numbers from TMDB Season 1
      let maxEp = movieBoxMaxEp || 52; // prioritize MovieBox maxEp if resolved
      
      episodes = [];
      for (let i = 1; i <= maxEp; i++) {
        const absEpNum = offset + i;
        const matchingEp = tmdbEpisodes.find(ep => ep.episode_number === absEpNum);
        const isReleased = movieBoxMaxEp !== null && i <= movieBoxMaxEp;
        if (matchingEp) {
          episodes.push({
            episode_number: i, // keep MovieBox episode number so UI maps correctly
            name: matchingEp.name || `Episode ${i}`,
            runtime: matchingEp.runtime,
            overview: matchingEp.overview || '',
            still_path: matchingEp.still_path || null,
            air_date: isReleased ? '1970-01-01' : matchingEp.air_date
          });
        } else {
          episodes.push({
            episode_number: i,
            name: `Episode ${i}`,
            runtime: null,
            overview: '',
            still_path: null,
            air_date: isReleased ? '1970-01-01' : null
          });
        }
      }
    } else {
      episodes = tmdbEpisodes.map(ep => {
        const isReleased = movieBoxMaxEp !== null && ep.episode_number <= movieBoxMaxEp;
        return {
          episode_number: ep.episode_number,
          name: ep.name,
          runtime: ep.runtime,
          overview: ep.overview,
          still_path: ep.still_path,
          air_date: isReleased ? '1970-01-01' : ep.air_date
        };
      });
    }
    
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
  const hevcSupport = req.query.hevc !== 'false';
  const cacheKey = `movie-${tmdbId}-hevc=${hevcSupport}`;

  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  let resolvedTmdbId = tmdbId;
  let movieBoxResult = null;

  try {
    // 1. Try MovieBox Python bridge first (direct .mp4 — best quality)
    movieBoxResult = await getMovieBoxStream('movie', tmdbId, null, null, hevcSupport);
    if (movieBoxResult) {
      const isHevc = String(movieBoxResult.codec || '').toLowerCase().includes('hevc') || 
                     String(movieBoxResult.codec || '').toLowerCase().includes('h265');
      if (!isHevc || hevcSupport) {
        console.log(`[MovieBox] Success for movie ${tmdbId}: ${movieBoxResult.resolution}p`);
        setCache(cacheKey, movieBoxResult);
        return res.json(movieBoxResult);
      } else {
        console.log(`[MovieBox] Skipped HEVC stream for movie ${tmdbId} (client requested H.264 only)`);
      }
    }
  } catch (err) {
    console.error('MovieBox fetch error:', err);
  }

  // If MovieBox stream is HEVC-skipped or fails, we must attempt fallback scrapers.
  // BUT if the tmdbId is a MovieBox ID starting with "mb_", scrapers (Nontongo/VidSrc) 
  // will fail because they only accept numeric TMDB IDs.
  // Resolve the real TMDB ID from the movie title.
  if (String(tmdbId).startsWith('mb_')) {
    let title = null;
    if (movieBoxResult && movieBoxResult.title) {
      title = movieBoxResult.title;
    } else {
      try {
        const subjectId = tmdbId.replace('mb_', '');
        const infoUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/info/${subjectId}`;
        const infoRes = await axios.get(infoUrl, { timeout: 5000 });
        title = infoRes.data.title || infoRes.data.name || null;
      } catch (err) {
        console.warn(`[Stream Fallback] Failed to fetch metadata for MovieBox ID ${tmdbId}:`, err.message);
        // Fallback to local homepage.json lookup
        const subjectId = tmdbId.replace('mb_', '');
        title = getTitleFromHomepageJson(subjectId);
        if (title) {
          console.log(`[Stream Fallback] Found title in local homepage.json: "${title}"`);
        }
      }
    }

    if (title) {
      const resolved = await getTmdbIdForMovieBoxItem(title, null, 'movie');
      if (resolved) {
        resolvedTmdbId = String(resolved);
        console.log(`[Stream Fallback] Resolved MovieBox ID ${tmdbId} to TMDB ID ${resolvedTmdbId} for movie "${title}"`);
      }
    }
  }

  try {
    // 2. Fallback: existing scrapers (Nontongo etc.)
    const result = await getStreams('movie', resolvedTmdbId);
    if (result) {
      const proxyResult = {
        ...result,
        originalUrl: result.url,
        url: result.type === 'embed'
          ? result.url
          : (result.type === 'hls'
              ? `/api/proxy/m3u8?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`
              : `/api/proxy/segment?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`),
        subtitles: (result.subtitles || []).map(sub => ({
          ...sub,
          url: `/api/proxy/subtitle?url=${encodeURIComponent(sub.url)}&referer=${encodeURIComponent(result.referer || '')}`,
        })),
      };
      setCache(cacheKey, proxyResult);
      return res.json(proxyResult);
    }

    // 3. Last resort fallback: if scrapers returned nothing, but we skipped a MovieBox HEVC stream, serve it!
    if (movieBoxResult) {
      console.log(`[MovieBox Last Resort] Serving skipped HEVC stream for movie ${tmdbId} as no H.264 fallbacks exist`);
      setCache(cacheKey, movieBoxResult);
      return res.json(movieBoxResult);
    }

    res.status(404).json({ error: 'No streams found', tmdbId: resolvedTmdbId });
  } catch (err) {
    console.error('Stream extraction error:', err);
    if (movieBoxResult) {
      console.log(`[MovieBox Last Resort] Serving skipped HEVC stream for movie ${tmdbId} after extraction failure`);
      setCache(cacheKey, movieBoxResult);
      return res.json(movieBoxResult);
    }
    res.status(500).json({ error: 'Extraction failed', message: err.message });
  }
});

app.get('/api/stream/tv/:tmdbId/:season/:episode', async (req, res) => {
  const { tmdbId, season, episode } = req.params;
  const hevcSupport = req.query.hevc !== 'false';
  const cacheKey = `tv-${tmdbId}-${season}-${episode}-hevc=${hevcSupport}`;

  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  let resolvedTmdbId = tmdbId;
  let movieBoxResult = null;

  try {
    // 1. Try MovieBox Python bridge first
    movieBoxResult = await getMovieBoxStream('tv', tmdbId, parseInt(season), parseInt(episode), hevcSupport);
    if (movieBoxResult) {
      const isHevc = String(movieBoxResult.codec || '').toLowerCase().includes('hevc') || 
                     String(movieBoxResult.codec || '').toLowerCase().includes('h265');
      if (!isHevc || hevcSupport) {
        console.log(`[MovieBox] Success for TV ${tmdbId} S${season}E${episode}: ${movieBoxResult.resolution}p`);
        setCache(cacheKey, movieBoxResult);
        return res.json(movieBoxResult);
      } else {
        console.log(`[MovieBox] Skipped HEVC stream for TV ${tmdbId} S${season}E${episode} (client requested H.264 only)`);
      }
    }
  } catch (err) {
    console.error('MovieBox fetch error:', err);
  }

  // If MovieBox stream is HEVC-skipped or fails, we must attempt fallback scrapers.
  // BUT if the tmdbId is a MovieBox ID starting with "mb_", scrapers (Nontongo/VidSrc) 
  // will fail because they only accept numeric TMDB IDs.
  // Resolve the real TMDB ID from the TV show title.
  if (String(tmdbId).startsWith('mb_')) {
    let title = null;
    if (movieBoxResult && movieBoxResult.title) {
      title = movieBoxResult.title;
    } else {
      try {
        const subjectId = tmdbId.replace('mb_', '');
        const infoUrl = `${PYTHON_BRIDGE_URL}/api/moviebox/info/${subjectId}`;
        const infoRes = await axios.get(infoUrl, { timeout: 5000 });
        title = infoRes.data.title || infoRes.data.name || null;
      } catch (err) {
        console.warn(`[Stream Fallback] Failed to fetch metadata for MovieBox ID ${tmdbId}:`, err.message);
        // Fallback to local homepage.json lookup
        const subjectId = tmdbId.replace('mb_', '');
        title = getTitleFromHomepageJson(subjectId);
        if (title) {
          console.log(`[Stream Fallback] Found title in local homepage.json: "${title}"`);
        }
      }
    }

    if (title) {
      const resolved = await getTmdbIdForMovieBoxItem(title, null, 'tv');
      if (resolved) {
        resolvedTmdbId = String(resolved);
        console.log(`[Stream Fallback] Resolved MovieBox ID ${tmdbId} to TMDB ID ${resolvedTmdbId} for TV "${title}"`);
      }
    }
  }

  try {
    let scraperSeason = parseInt(season);
    if (String(resolvedTmdbId) === '124364' && scraperSeason > 1) {
      scraperSeason = scraperSeason - 1;
      console.log(`[Stream Fallback] Mapped S${season} -> S${scraperSeason} for TMDB ID ${resolvedTmdbId}`);
    }

    // 2. Fallback: existing scrapers
    const result = await getStreams('tv', resolvedTmdbId, scraperSeason, parseInt(episode));
    if (result) {
      const proxyResult = {
        ...result,
        originalUrl: result.url,
        url: result.type === 'embed'
          ? result.url
          : (result.type === 'hls'
              ? `/api/proxy/m3u8?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`
              : `/api/proxy/segment?url=${encodeURIComponent(result.url)}&referer=${encodeURIComponent(result.referer || '')}`),
        subtitles: (result.subtitles || []).map(sub => ({
          ...sub,
          url: `/api/proxy/subtitle?url=${encodeURIComponent(sub.url)}&referer=${encodeURIComponent(result.referer || '')}`,
        })),
      };
      setCache(cacheKey, proxyResult);
      return res.json(proxyResult);
    }

    // 3. Last resort fallback: if scrapers returned nothing, but we skipped a MovieBox HEVC stream, serve it!
    if (movieBoxResult) {
      console.log(`[MovieBox Last Resort] Serving skipped HEVC stream for TV ${tmdbId} S${season}E${episode} as no H.264 fallbacks exist`);
      setCache(cacheKey, movieBoxResult);
      return res.json(movieBoxResult);
    }

    res.status(404).json({ error: 'No streams found', tmdbId: resolvedTmdbId, season, episode });
  } catch (err) {
    console.error('Stream extraction error:', err);
    if (movieBoxResult) {
      console.log(`[MovieBox Last Resort] Serving skipped HEVC stream for TV ${tmdbId} S${season}E${episode} after extraction failure`);
      setCache(cacheKey, movieBoxResult);
      return res.json(movieBoxResult);
    }
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

    let subtitleText = data;
    // Auto-convert SRT format to WebVTT on the fly for successful browser rendering
    if (typeof subtitleText === 'string' && !subtitleText.trim().startsWith('WEBVTT')) {
      subtitleText = 'WEBVTT\n\n' + subtitleText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Convert SRT timing format "00:00:00,000" to WebVTT timing format "00:00:00.000"
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(subtitleText);

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
    shell: process.platform === 'win32',
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

// ---- Mock Casting Session Database ----
const castSessions = new Map();

// Generate a random secure short-lived token/sessionId
function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Automatically simulate playback state changes (progress increment) for active sessions
setInterval(() => {
  castSessions.forEach((session) => {
    if (session.state === 'PLAYING') {
      session.currentTime += 1;
      if (session.duration && session.currentTime >= session.duration) {
        session.currentTime = session.duration;
        session.state = 'ENDED';
      }
    }
  });
}, 1000);

app.post('/api/cast/session/start', (req, res) => {
  const { contentId, episodeId, deviceType, deviceId, startTime } = req.body;
  if (!contentId) return res.status(400).json({ error: 'Missing contentId' });

  const sessionId = generateSessionId();
  const session = {
    sessionId,
    contentId,
    episodeId: episodeId || null,
    deviceType: deviceType || 'Chromecast',
    deviceId: deviceId || 'living-room-tv',
    currentTime: parseFloat(startTime || '0') || 0,
    duration: 3600, // standard mock duration 1 hour
    state: 'PLAYING',
    volume: 80,
    muted: false,
    timestamp: Date.now()
  };

  castSessions.set(sessionId, session);
  console.log(`[Cast API] Started session ${sessionId} for content ${contentId} on device ${deviceType}`);
  res.json({ sessionId, session });
});

app.post('/api/cast/session/control', (req, res) => {
  const { sessionId, action, value } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const session = castSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  console.log(`[Cast API] Control session ${sessionId}: action=${action}, value=${value}`);

  switch (action) {
    case 'play':
      session.state = 'PLAYING';
      break;
    case 'pause':
      session.state = 'PAUSED';
      break;
    case 'seek':
      session.currentTime = parseFloat(value) || 0;
      break;
    case 'volume':
      session.volume = parseInt(value) || 80;
      break;
    case 'mute':
      session.muted = value === true;
      break;
    case 'stop':
      session.state = 'STOPPED';
      castSessions.delete(sessionId);
      break;
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  res.json({ success: true, session });
});

app.get('/api/cast/session/status', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const session = castSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  res.json(session);
});

// ---- Download & Offline DRM License Endpoints ----
app.get('/api/player/manifest', (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing content ID' });
  
  res.json({
    id,
    title: 'ABR Adaptive Manifest',
    type: 'application/x-mpegURL',
    profiles: [
      { quality: 'low', resolution: '480p', bitrate: 800000, url: `/api/stream/mock/${id}/480p/index.m3u8` },
      { quality: 'standard', resolution: '720p', bitrate: 1800000, url: `/api/stream/mock/${id}/720p/index.m3u8` },
      { quality: 'high', resolution: '1080p', bitrate: 4500000, url: `/api/stream/mock/${id}/1080p/index.m3u8` }
    ],
    drm: {
      type: 'widevine-simulated',
      licenseUrl: `/api/download/auth?id=${id}`
    }
  });
});

app.post('/api/download/auth', (req, res) => {
  const { id, type } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing content id' });
  
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const token = Buffer.from(JSON.stringify({ id, type, expiresAt })).toString('base64').replace(/=/g, '');
  
  console.log(`[License API] Issued offline DRM license token for ${id}, expires in 7 days`);
  res.json({
    success: true,
    token: `piq_lic_${token}`,
    expiresAt
  });
});

app.post('/api/download/revoke', (req, res) => {
  const { id, token } = req.body;
  console.log(`[License API] Revoking offline DRM license for content ${id}, token: ${token}`);
  res.json({
    success: true,
    message: `License revoked successfully for id: ${id}`
  });
});

// ========================================
// ---- Intelligent Source Validator ----
// ========================================

// Source definitions mirrored from PlayerPage.js
const VALIDATE_SOURCES = [
  { id: 'nontongo',      name: 'Nontongo',                  tag: 'General' },
  { id: 'streamimdb',   name: 'StreamIMDB',                 tag: 'General' },
  { id: 'vidsrc_to',    name: 'VidSrc TO',                  tag: 'Dual Audio' },
  { id: 'smashystream', name: 'SmashyStream',               tag: 'Indian' },
  { id: 'superembed',   name: 'SuperEmbed',                  tag: 'General' },
  { id: 'vidsrc_cc',    name: 'VidSrc CC',                  tag: 'General' },
  { id: 'embed_su',     name: 'Embed SU',                   tag: 'General' },
  { id: 'multiembed',   name: 'MultiEmbed',                 tag: 'General' },
  { id: 'autoembed',    name: 'AutoEmbed',                  tag: 'General' },
];

function buildSourceUrl(sourceId, tmdbId, imdbId, type, season, episode) {
  const id = tmdbId;
  const iid = imdbId || id;
  const s = season || 1;
  const e = episode || 1;
  if (type === 'tv') {
    switch (sourceId) {
      case 'nontongo':      return `https://www.nontongo.win/embed/tv/${id}/${s}/${e}`;
      case 'streamimdb':    return `https://streamimdb.ru/embed/tv/${iid}/${s}/${e}`;
      case 'vidsrc_to':     return `https://vidsrc.to/embed/tv/${id}/${s}/${e}`;
      case 'smashystream':  return `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`;
      case 'superembed':    return `https://multiembed.mov/direct/super.php?video_id=${id}&tmdb=1&s=${s}&e=${e}`;
      case 'vidsrc_cc':     return `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`;
      case 'embed_su':      return `https://embed.su/embed/tv/${id}/${s}/${e}`;
      case 'multiembed':    return `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`;
      case 'autoembed':     return `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`;
    }
  }
  // Default: movie
  switch (sourceId) {
    case 'nontongo':      return `https://www.nontongo.win/embed/movie/${id}`;
    case 'streamimdb':    return `https://streamimdb.ru/embed/movie/${iid}`;
    case 'vidsrc_to':     return `https://vidsrc.to/embed/movie/${id}`;
    case 'smashystream':  return `https://embed.smashystream.com/playere.php?tmdb=${id}`;
    case 'superembed':    return `https://multiembed.mov/direct/super.php?video_id=${id}&tmdb=1`;
    case 'vidsrc_cc':     return `https://vidsrc.cc/v2/embed/movie/${id}`;
    case 'embed_su':      return `https://embed.su/embed/movie/${id}`;
    case 'multiembed':    return `https://multiembed.mov/?video_id=${id}&tmdb=1`;
    case 'autoembed':     return `https://player.autoembed.cc/embed/movie/${id}`;
  }
  return null;
}

async function checkSource(source, tmdbId, imdbId, type, season, episode) {
  const url = buildSourceUrl(source.id, tmdbId, imdbId, type, season, episode);
  if (!url) return { ...source, available: false, score: 0, badge: 'unavailable', reason: 'no_url' };

  const startTime = Date.now();
  const TIMEOUT = 5000;

  try {
    let available = false;
    let badge = 'available';
    let reason = 'ok';

    // --- Per-source detection strategy ---
    if (source.id === 'nontongo') {
      // Fetch full HTML and check for explicit "Not Available" marker
      const { data, status } = await axios.get(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        maxRedirects: 5,
      });
      if (status !== 200) { available = false; reason = `http_${status}`; }
      else {
        // Nontongo puts a gray "Not Available" span in the genre div when content is absent
        const isNotAvailable = /Not Available/i.test(data) && /border:1px solid #666/i.test(data);
        available = !isNotAvailable;
        reason = isNotAvailable ? 'content_not_found' : 'player_ready';
      }

    } else if (source.id === 'streamimdb') {
      // StreamIMDB needs IMDB ID — if no IMDB ID, skip it
      if (!imdbId) {
        return { ...source, url, available: false, score: 0, badge: 'unavailable', reason: 'no_imdb_id', responseMs: 0 };
      }
      const { status } = await axios.head(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 5,
        validateStatus: () => true,
      });
      available = status === 200;
      reason = `http_${status}`;

    } else if (source.id === 'vidsrc_to') {
      // VidSrc TO wraps vsembed.ru — fetch outer page, extract inner src, then HEAD it
      const { data, status } = await axios.get(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 5,
        validateStatus: () => true,
      });
      if (status !== 200) { available = false; reason = `outer_http_${status}`; }
      else {
        // Extract inner iframe src from the response
        const innerMatch = data.match(/iframe[^>]+src=["']([^"']+vsembed[^"']+)["']/i)
          || data.match(/iframe[^>]+src=["']([^"']+embed[^"']+)["']/i);
        if (innerMatch) {
          try {
            const innerRes = await axios.head(innerMatch[1], {
              timeout: 3000,
              headers: { 'User-Agent': 'Mozilla/5.0' },
              validateStatus: () => true,
            });
            available = innerRes.status === 200;
            reason = `inner_http_${innerRes.status}`;
          } catch {
            // inner HEAD failed — but outer page loaded. Mark uncertain.
            available = null;
            badge = 'uncertain';
            reason = 'inner_check_failed';
          }
        } else {
          // No inner iframe found — mark uncertain (JS-rendered?)
          available = null;
          badge = 'uncertain';
          reason = 'no_inner_iframe';
        }
      }

    } else if (source.id === 'smashystream') {
      // SmashyStream is a React SPA — always returns 200. Cannot detect availability.
      // Mark as Uncertain always.
      const { status } = await axios.head(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        validateStatus: () => true,
      });
      available = status === 200 ? null : false; // null = uncertain (SPA)
      badge = status === 200 ? 'uncertain' : 'unavailable';
      reason = status === 200 ? 'spa_cannot_verify' : `http_${status}`;

    } else {
      // All others: simple HEAD request
      const { status } = await axios.head(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 5,
        validateStatus: () => true,
      });
      available = status === 200 || status === 206;
      reason = `http_${status}`;
      if (!available) badge = 'unavailable';
    }

    const responseMs = Date.now() - startTime;

    // --- Scoring ---
    let score = 0;
    if (available === true)  score += 50;
    else if (available === null) score += 20; // uncertain but reachable
    else score = 0; // unavailable

    if (source.id === 'smashystream') score += 20; // Indian content bonus
    if (source.id === 'vidsrc_to')    score += 15; // Dual audio bonus
    if (responseMs < 2000 && available) score += 10; // Fast bonus
    else if (responseMs < 3500 && available) score += 5;

    // Set badge based on final state
    if (available === true) {
      if (score >= 75) badge = 'recommended'; // Will be overridden on top-1 below
      else badge = 'available';
      if (source.id === 'smashystream') badge = 'indian';
      if (source.id === 'vidsrc_to')    badge = 'dual_audio';
    } else if (available === null) {
      badge = 'uncertain';
    } else {
      badge = 'unavailable';
    }

    return { ...source, url, available, score, badge, reason, responseMs };

  } catch (err) {
    const responseMs = Date.now() - startTime;
    let reason = 'error';
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') reason = 'dns_failure';
    else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') reason = 'timeout';
    else if (err.response?.status) reason = `http_${err.response.status}`;
    return { ...source, url, available: false, score: 0, badge: 'unavailable', reason, responseMs };
  }
}

async function validateAllSources(tmdbId, imdbId, type, season, episode) {
  // Run all checks in parallel
  const results = await Promise.all(
    VALIDATE_SOURCES.map(src => checkSource(src, tmdbId, imdbId, type, season, episode))
  );

  // Sort: available > uncertain > unavailable, then by score desc
  results.sort((a, b) => {
    const aVal = a.available === true ? 2 : a.available === null ? 1 : 0;
    const bVal = b.available === true ? 2 : b.available === null ? 1 : 0;
    if (bVal !== aVal) return bVal - aVal;
    return b.score - a.score;
  });

  // Mark the single top available source as 'recommended'
  const topAvailable = results.find(r => r.available === true);
  if (topAvailable) topAvailable.badge = 'recommended';

  console.log(`[SourceValidator] Results for ${type} ${tmdbId}: ${results.filter(r => r.available === true).length} available, ${results.filter(r => r.available === null).length} uncertain, ${results.filter(r => r.available === false).length} unavailable`);
  return results;
}

// /api/validate/sources endpoint — runs parallel iframe availability checks
app.get('/api/validate/sources', async (req, res) => {
  const { tmdbId, imdbId, type = 'movie', season = '1', episode = '1' } = req.query;
  if (!tmdbId) return res.status(400).json({ error: 'Missing tmdbId' });

  const cacheKey = `src-validate-${type}-${tmdbId}-${season}-${episode}`;

  // Check cache (1-hour TTL for source validation results)
  const entry = cache.get(cacheKey);
  if (entry && Date.now() - entry.ts < 60 * 60 * 1000) {
    return res.json({ results: entry.data, cached: true });
  }

  try {
    const results = await validateAllSources(tmdbId, imdbId || null, type, parseInt(season), parseInt(episode));
    // Cache for 1 hour
    cache.set(cacheKey, { data: results, ts: Date.now() });
    res.json({ results, cached: false });
  } catch (err) {
    console.error('[SourceValidator] Error:', err.message);
    res.status(500).json({ error: 'Validation failed', message: err.message });
  }
});

// /api/validate/sources/stream — SSE endpoint for live per-server validation updates
// Each source check fires in parallel; results are streamed back individually as they resolve.
app.get('/api/validate/sources/stream', async (req, res) => {
  const { tmdbId, imdbId, type = 'movie', season = '1', episode = '1' } = req.query;
  if (!tmdbId) return res.status(400).json({ error: 'Missing tmdbId' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx response buffering
  res.flushHeaders();

  // Helper to send SSE data frame
  const send = (data) => {
    try {
      if (!res.destroyed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    } catch (e) {}
  };

  // Keep-alive ping every 15 s so the connection isn't dropped by proxies
  const pingInterval = setInterval(() => send({ type: 'ping' }), 15000);
  req.on('close', () => clearInterval(pingInterval));

  // Check server-side cache first — serve instantly, still via SSE format
  const cacheKey = `src-validate-${type}-${tmdbId}-${season}-${episode}`;
  const entry = cache.get(cacheKey);
  if (entry && Date.now() - entry.ts < 60 * 60 * 1000) {
    clearInterval(pingInterval);
    // Push each cached result individually (simulates live feel on repeat views)
    for (const result of entry.data) {
      send({ type: 'result', result });
    }
    send({ type: 'complete', results: entry.data, cached: true });
    res.end();
    return;
  }

  try {
    const allResults = [];

    // Run all source checks in parallel — push each result the moment it resolves
    const promises = VALIDATE_SOURCES.map(async (src) => {
      const result = await checkSource(src, tmdbId, imdbId || null, type, parseInt(season), parseInt(episode));
      allResults.push(result);
      send({ type: 'result', result });
      return result;
    });

    await Promise.all(promises);
    clearInterval(pingInterval);

    // Sort: available > uncertain > unavailable, then score desc
    allResults.sort((a, b) => {
      const aVal = a.available === true ? 2 : a.available === null ? 1 : 0;
      const bVal = b.available === true ? 2 : b.available === null ? 1 : 0;
      if (bVal !== aVal) return bVal - aVal;
      return b.score - a.score;
    });

    // Mark the top available source as recommended
    const topAvailable = allResults.find(r => r.available === true);
    if (topAvailable) topAvailable.badge = 'recommended';

    // Persist in server cache for 1 hour
    cache.set(cacheKey, { data: allResults, ts: Date.now() });

    console.log(`[SourceValidator/SSE] ${type} ${tmdbId}: ${allResults.filter(r => r.available === true).length} available, ${allResults.filter(r => r.available === null).length} uncertain, ${allResults.filter(r => r.available === false).length} unavailable`);

    send({ type: 'complete', results: allResults, cached: false });
    if (!res.writableEnded) res.end();
  } catch (err) {
    clearInterval(pingInterval);
    console.error('[SourceValidator/SSE] Error:', err.message);
    send({ type: 'error', message: err.message });
    if (!res.writableEnded) res.end();
  }
});

// ---- Nodemailer Transporter Configuration (Resend/SMTP fallback) ----
const smtpHost = process.env.SMTP_HOST || 'smtp.resend.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465');
const smtpUser = process.env.SMTP_USER || 'resend';
const smtpPass = process.env.SMTP_PASS || 'placeholder_smtp_password'; // Default SMTP password placeholder
const smtpFrom = process.env.SMTP_FROM || 'PlayerIQ <onboarding@resend.dev>';

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass
  },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000
});

// ---- Watch Together Invitation Email Endpoint ----
app.post('/api/email/send-invite', async (req, res) => {
  const { hostName, inviteeEmail, title, partyId, mediaType, posterPath } = req.body;
  
  if (!hostName || !inviteeEmail || !title || !partyId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const joinLink = `https://playeriq.suyogmahagaonkar.me/#/watch-party/join/${partyId}`;
  const posterUrl = posterPath 
    ? (posterPath.startsWith('http') ? posterPath : `https://image.tmdb.org/t/p/w300${posterPath}`)
    : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&auto=format&fit=crop&q=60';

  const mailOptions = {
    from: smtpFrom,
    to: inviteeEmail,
    subject: `🍿 You're Invited! Watch "${title}" with ${hostName} on PlayerIQ`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Watch Together Invitation</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #050505;
            color: #e8e8ed;
            margin: 0;
            padding: 40px 20px;
          }
          .card {
            max-width: 500px;
            margin: 0 auto;
            background-color: #0c0c0f;
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 16px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
          }
          .title {
            color: #ffffff;
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .subtitle {
            color: #a855f7;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 24px;
          }
          .poster {
            width: 140px;
            height: 210px;
            border-radius: 12px;
            object-fit: cover;
            border: 2px solid rgba(168,85,247,0.3);
            margin-bottom: 24px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.5);
          }
          .message {
            color: #b8b8cc;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 32px;
          }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 30px;
            font-weight: 700;
            font-size: 15px;
            letter-spacing: 0.5px;
            box-shadow: 0 0 20px rgba(168,85,247,0.35);
            transition: all 0.3s;
          }
          .footer {
            margin-top: 32px;
            color: #4a4a5e;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="subtitle">Watch Together</div>
          <div class="title">Join ${hostName}</div>
          <p class="message">${hostName} has invited you to watch <strong>${title}</strong> (${mediaType === 'tv' ? 'Series' : 'Movie'}) together in real-time on PlayerIQ!</p>
          <img class="poster" src="${posterUrl}" alt="${title} Poster">
          <div>
            <a class="btn" href="${joinLink}" target="_blank">Accept Invitation</a>
          </div>
          <div class="footer">
            If you do not have an account, you will be prompted to sign up or sign in first.<br/>
            PlayerIQ &copy; 2026. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const cleanSmtpPass = (smtpPass || '').replace(/^['"]|['"]$/g, '').trim();
    const cleanSmtFrom = (smtpFrom || '').replace(/^['"]|['"]$/g, '').trim();

    if (cleanSmtpPass && cleanSmtpPass.startsWith('re_')) {
      console.log('[Email] Sending via Resend REST API (HTTPS)...');
      await axios.post('https://api.resend.com/emails', {
        from: cleanSmtFrom,
        to: [inviteeEmail],
        subject: `🍿 You're Invited! Watch "${title}" with ${hostName} on PlayerIQ`,
        html: mailOptions.html
      }, {
        headers: {
          'Authorization': `Bearer ${cleanSmtpPass}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      });
      console.log(`[Email] Invitation successfully sent (REST API) to ${inviteeEmail} for party room ${partyId}`);
    } else {
      console.log('[Email] Sending via SMTP...');
      await transporter.sendMail(mailOptions);
      console.log(`[Email] Invitation successfully sent (SMTP) to ${inviteeEmail} for party room ${partyId}`);
    }
    res.json({ success: true, message: 'Invitation email sent successfully.' });
  } catch (err) {
    const errMsg = err.response?.data?.message || err.response?.data || err.message;
    console.error('[Email Error] Failed to send invite email:', errMsg);
    console.log(`\n  [Mock Invite Link]: ${joinLink}\n`);
    res.status(500).json({ 
      error: 'Failed to send invite email.', 
      details: typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg,
      mockLink: joinLink
    });
  }
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`\n  ⚡ PlayerIQ Proxy Server running at http://localhost:${PORT}`);
  console.log(`  📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`  🎬 Test movie:   http://localhost:${PORT}/api/stream/movie/24428`);
  console.log(`  📺 Test TV:      http://localhost:${PORT}/api/stream/tv/76479/5/5\n`);
});
