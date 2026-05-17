// ========================================
// PlayerIQ — Scraper: Nontongo
// ========================================

import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': 'https://www.nontongo.win/',
};

/**
 * Extract stream from Nontongo
 * Flow:
 *   1. GET /embed/movie/{tmdbId} → parse HTML to find IMDB ID in the play button JS
 *   2. GET /embed/movie/play-movie.php?id={imdbId} → extract stream URL from JS/HTML
 */
export async function extractNontongo(type, tmdbId, season = 1, episode = 1) {
  try {
    const embedPath = type === 'tv'
      ? `https://www.nontongo.win/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://www.nontongo.win/embed/movie/${tmdbId}`;

    // Step 1: Fetch the embed landing page
    const { data: embedHtml } = await axios.get(embedPath, {
      headers: HEADERS,
      timeout: 10000,
    });

    // Parse the HTML to find the inner player URL
    // Nontongo has a loadIframe() function with the actual player URL
    // Pattern: src:'https://nontongo.win/embed/movie/play-movie.php?id=tt0848228'
    const innerUrlMatch = embedHtml.match(/src:\s*['"]([^'"]*play-(?:movie|tv)\.php\?[^'"]*)['"]/);
    if (!innerUrlMatch) {
      // Try alternate pattern for TV shows
      const altMatch = embedHtml.match(/src:\s*['"]([^'"]*(?:play|embed)[^'"]*\.php\?[^'"]*)['"]/);
      if (!altMatch) {
        console.log('[Nontongo] Could not find inner player URL');
        return null;
      }
      return await extractFromInnerPlayer(altMatch[1]);
    }

    return await extractFromInnerPlayer(innerUrlMatch[1]);

  } catch (err) {
    console.error('[Nontongo] Extraction failed:', err.message);
    return null;
  }
}

async function extractFromInnerPlayer(playerUrl) {
  try {
    // Ensure full URL
    if (playerUrl.startsWith('//')) playerUrl = 'https:' + playerUrl;
    if (!playerUrl.startsWith('http')) playerUrl = 'https://nontongo.win' + playerUrl;

    console.log('[Nontongo] Fetching inner player:', playerUrl);

    const { data: playerHtml } = await axios.get(playerUrl, {
      headers: {
        ...HEADERS,
        'Referer': 'https://www.nontongo.win/',
      },
      timeout: 10000,
    });

    // Look for m3u8 URL patterns
    const m3u8Match = playerHtml.match(/(?:file|source|src|url)\s*[:=]\s*['"]([^'"]*\.m3u8[^'"]*)['"]/i);
    if (m3u8Match) {
      console.log('[Nontongo] Found m3u8:', m3u8Match[1]);
      return {
        url: m3u8Match[1],
        type: 'hls',
        provider: 'nontongo',
        referer: playerUrl,
        subtitles: extractSubtitles(playerHtml),
      };
    }

    // Look for mp4 URL patterns
    const mp4Match = playerHtml.match(/(?:file|source|src|url)\s*[:=]\s*['"]([^'"]*\.mp4[^'"]*)['"]/i);
    if (mp4Match) {
      console.log('[Nontongo] Found mp4:', mp4Match[1]);
      return {
        url: mp4Match[1],
        type: 'mp4',
        provider: 'nontongo',
        referer: playerUrl,
        subtitles: extractSubtitles(playerHtml),
      };
    }

    // Look for embedded player sources — sometimes the URL is in a nested iframe
    const nestedIframeMatch = playerHtml.match(/(?:iframe|embed)[^>]*src\s*=\s*['"]([^'"]+)['"]/i);
    if (nestedIframeMatch) {
      let nestedUrl = nestedIframeMatch[1];
      if (nestedUrl.startsWith('//')) {
        nestedUrl = 'https:' + nestedUrl;
      } else if (nestedUrl.startsWith('/')) {
        nestedUrl = new URL(nestedUrl, playerUrl).href;
      } else if (!nestedUrl.startsWith('http')) {
        nestedUrl = new URL(nestedUrl, playerUrl).href;
      }
      console.log('[Nontongo] Found nested iframe, fetching:', nestedUrl);

      // Try to extract from the nested page
      const { data: nestedHtml } = await axios.get(nestedUrl, {
        headers: { ...HEADERS, 'Referer': playerUrl },
        timeout: 10000,
      });

      const nestedM3u8 = nestedHtml.match(/(?:file|source|src|url)\s*[:=]\s*['"]([^'"]*\.m3u8[^'"]*)['"]/i);
      if (nestedM3u8) {
        return {
          url: nestedM3u8[1],
          type: 'hls',
          provider: 'nontongo',
          referer: nestedUrl,
          subtitles: extractSubtitles(nestedHtml),
        };
      }

      const nestedMp4 = nestedHtml.match(/(?:file|source|src|url)\s*[:=]\s*['"]([^'"]*\.mp4[^'"]*)['"]/i);
      if (nestedMp4) {
        return {
          url: nestedMp4[1],
          type: 'mp4',
          provider: 'nontongo',
          referer: nestedUrl,
          subtitles: extractSubtitles(nestedHtml),
        };
      }

      // Try to find encoded/obfuscated URLs
      return extractObfuscatedUrls(nestedHtml, nestedUrl);
    }

    // Last resort: look for obfuscated URLs
    return extractObfuscatedUrls(playerHtml, playerUrl);

  } catch (err) {
    console.error('[Nontongo] Inner player extraction failed:', err.message);
    return null;
  }
}

function extractSubtitles(html) {
  const subs = [];
  // Pattern: { file: 'url.vtt', label: 'English' }
  const subRegex = /\{\s*(?:file|src)\s*:\s*['"]([^'"]*\.(?:vtt|srt)[^'"]*)['"]\s*,\s*(?:label|lang)\s*:\s*['"]([^'"]*)['"]/gi;
  let match;
  while ((match = subRegex.exec(html)) !== null) {
    subs.push({ url: match[1], label: match[2] });
  }
  // Also try track elements
  const trackRegex = /<track[^>]*src=['"]([^'"]*\.(?:vtt|srt)[^'"]*)['""][^>]*label=['"]([^'"]*)['"]/gi;
  while ((match = trackRegex.exec(html)) !== null) {
    subs.push({ url: match[1], label: match[2] });
  }
  return subs;
}

function extractObfuscatedUrls(html, referer) {
  // Try base64 encoded URLs
  const b64Matches = html.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/g);
  if (b64Matches) {
    for (const match of b64Matches) {
      try {
        const b64 = match.match(/atob\(['"]([^'"]+)['"]\)/)[1];
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        if (decoded.includes('.m3u8')) {
          console.log('[Nontongo] Found base64 m3u8:', decoded);
          return { url: decoded, type: 'hls', provider: 'nontongo', referer, subtitles: [] };
        }
        if (decoded.includes('.mp4')) {
          return { url: decoded, type: 'mp4', provider: 'nontongo', referer, subtitles: [] };
        }
      } catch (e) { /* skip */ }
    }
  }

  // Try hex-encoded URLs
  const hexMatch = html.match(/\\x68\\x74\\x74\\x70[^'"]+/);
  if (hexMatch) {
    try {
      const decoded = hexMatch[0].replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      if (decoded.includes('.m3u8') || decoded.includes('.mp4')) {
        return {
          url: decoded,
          type: decoded.includes('.m3u8') ? 'hls' : 'mp4',
          provider: 'nontongo',
          referer,
          subtitles: [],
        };
      }
    } catch (e) { /* skip */ }
  }

  console.log('[Nontongo] No stream URLs found in page');
  return null;
}
