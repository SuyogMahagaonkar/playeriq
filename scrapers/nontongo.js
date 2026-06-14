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
 * Multi-step flow:
 *   1. Fetch landing page (tv/movie)
 *   2. Find inner player URL (tv_nontongo.php or play-movie.php) and fetch it
 *   3. Find server link (getPlayTV.php or getPlay.php) and fetch it
 *   4. Capture JS redirection to subdomain load page (/x1/.../load) and fetch it
 *   5. Decode base64 payload to find playerFrame src, resolve it relative to load page, and fetch it
 *   6. Parse JS sources and tracks arrays to get video streaming URL and subtitles
 */
export async function extractNontongo(type, tmdbId, season = 1, episode = 1) {
  try {
    const embedPath = type === 'tv'
      ? `https://www.nontongo.win/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://www.nontongo.win/embed/movie/${tmdbId}`;

    console.log(`[Nontongo] Step 1: Fetching landing page: ${embedPath}`);
    const { data: embedHtml } = await axios.get(embedPath, {
      headers: HEADERS,
      timeout: 10000,
    });

    // Find inner player PHP (e.g. tv_nontongo.php or play-movie.php)
    let innerUrl = null;
    const match = embedHtml.match(/src:\s*['"]([^'"]*(?:play|embed|tv_nontongo|movie_nontongo)[^'"]*\.php\?[^'"]*)['"]/i);
    if (match) {
      innerUrl = match[1];
    } else {
      // General match for php scripts containing parameters
      const scriptRegex = /['"]([^'"]+\.php\?[^'"]+)['"]/g;
      let m;
      while ((m = scriptRegex.exec(embedHtml)) !== null) {
        if (m[1].includes('id=')) {
          innerUrl = m[1];
          break;
        }
      }
    }

    if (!innerUrl) {
      console.log('[Nontongo] Failed: Could not locate inner player URL');
      return null;
    }

    if (innerUrl.startsWith('//')) innerUrl = 'https:' + innerUrl;
    if (!innerUrl.startsWith('http')) innerUrl = 'https://nontongo.win' + innerUrl;

    console.log(`[Nontongo] Step 2: Fetching inner player page: ${innerUrl}`);
    const { data: innerHtml } = await axios.get(innerUrl, {
      headers: { ...HEADERS, Referer: embedPath },
      timeout: 10000,
    });

    // Extract server link (e.g., getPlayTV.php or getPlay.php)
    let getPlayUrl = null;
    const $ = cheerio.load(innerHtml);
    const iframeDataSrc = $('#iframePlayer').attr('data-src') || $('#iframePlayer').attr('src');
    if (iframeDataSrc && iframeDataSrc !== 'undefined') {
      getPlayUrl = iframeDataSrc;
    } else {
      // Look for server switch buttons
      $('.iframe-server-button').each((i, el) => {
        const link = $(el).attr('data-link');
        if (link && !getPlayUrl) {
          getPlayUrl = link;
        }
      });
    }

    if (!getPlayUrl) {
      // Fallback regex scan for data-link
      const linkMatch = innerHtml.match(/data-link=['"]([^'"]+)['"]/);
      if (linkMatch) {
        getPlayUrl = linkMatch[1];
      }
    }

    if (!getPlayUrl) {
      console.log('[Nontongo] Failed: Could not locate server/getPlay URL');
      return null;
    }

    if (getPlayUrl.startsWith('//')) getPlayUrl = 'https:' + getPlayUrl;
    if (!getPlayUrl.startsWith('http')) getPlayUrl = 'https://nontongo.win' + getPlayUrl;

    console.log(`[Nontongo] Step 3: Fetching server switch URL: ${getPlayUrl}`);
    const { data: playData } = await axios.get(getPlayUrl, {
      headers: { ...HEADERS, Referer: innerUrl },
      timeout: 10000,
    });

    // Extract JS redirection target (window.location.href)
    const redirectMatch = playData.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (!redirectMatch) {
      console.log('[Nontongo] Failed: Redirect script not found in getPlay response');
      return null;
    }

    const loadUrl = redirectMatch[1];
    console.log(`[Nontongo] Step 4: Fetching load page: ${loadUrl}`);
    const { data: loadHtml } = await axios.get(loadUrl, {
      headers: { ...HEADERS, Referer: getPlayUrl },
      timeout: 10000,
    });

    // Decode base64 payload if wrapped
    let decodedHtml = loadHtml;
    const b64Match = loadHtml.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
    if (b64Match) {
      try {
        decodedHtml = Buffer.from(b64Match[1], 'base64').toString('utf8');
      } catch (e) {
        console.warn('[Nontongo] Failed to decode base64 wrapper:', e.message);
      }
    }

    // Find nested playerFrame src
    const playerFrameMatch = decodedHtml.match(/iframe[^>]*src\s*=\s*['"]([^'"]+)['"]/i);
    if (!playerFrameMatch) {
      console.log('[Nontongo] Failed: playerFrame src not found in load page');
      return null;
    }

    let playerFrameUrl = playerFrameMatch[1];
    if (playerFrameUrl.startsWith('//')) playerFrameUrl = 'https:' + playerFrameUrl;
    if (!playerFrameUrl.startsWith('http')) {
      playerFrameUrl = new URL(playerFrameUrl, loadUrl).href;
    }

    console.log(`[Nontongo] Success: Extracted embed frame URL: ${playerFrameUrl}`);
    return {
      url: playerFrameUrl,
      type: 'embed',
      provider: 'nontongo',
      referer: loadUrl,
      subtitles: []
    };

  } catch (err) {
    console.error('[Nontongo] Extraction failed:', err.message);
    return null;
  }
}
