// ========================================
// PlayerIQ — Scraper: VidSrc CC
// ========================================

import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

/**
 * Extract stream from VidSrc CC
 * VidSrc uses a multi-step process with encoded source URLs
 */
export async function extractVidsrc(type, tmdbId, season = 1, episode = 1) {
  try {
    const embedPath = type === 'tv'
      ? `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;

    console.log('[VidSrc] Fetching embed:', embedPath);

    const { data: html } = await axios.get(embedPath, {
      headers: { ...HEADERS, Referer: 'https://vidsrc.cc/' },
      timeout: 10000,
    });

    // VidSrc usually has source URLs in their JS
    // Pattern: data-src="..." or source URLs in script blocks
    const m3u8Match = html.match(/(?:file|source|src|url|data-src)\s*[:=]\s*['"]([^'"]*\.m3u8[^'"]*)['"]/i);
    if (m3u8Match) {
      console.log('[VidSrc] Found m3u8:', m3u8Match[1]);
      return {
        url: m3u8Match[1],
        type: 'hls',
        provider: 'vidsrc',
        referer: embedPath,
        subtitles: [],
      };
    }

    // Try to find API endpoints that return stream data
    const apiMatch = html.match(/(?:api|source|stream)['"]\s*:\s*['"]([^'"]+)['"]/i);
    if (apiMatch) {
      let apiUrl = apiMatch[1];
      if (apiUrl.startsWith('/')) apiUrl = 'https://vidsrc.cc' + apiUrl;
      if (apiUrl.startsWith('http')) {
        console.log('[VidSrc] Found API endpoint:', apiUrl);
        try {
          const { data: apiData } = await axios.get(apiUrl, {
            headers: { ...HEADERS, Referer: embedPath },
            timeout: 10000,
          });

          // If API returns JSON
          if (typeof apiData === 'object') {
            const streamUrl = apiData.source || apiData.url || apiData.file || apiData.stream;
            if (streamUrl) {
              return {
                url: streamUrl,
                type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
                provider: 'vidsrc',
                referer: embedPath,
                subtitles: (apiData.subtitles || apiData.tracks || []).map(s => ({
                  url: s.file || s.url || s.src,
                  label: s.label || s.lang || 'Unknown',
                })),
              };
            }
          }

          // If API returns text, look for URLs
          if (typeof apiData === 'string') {
            const urlMatch = apiData.match(/(https?:\/\/[^\s'"]+\.m3u8[^\s'"]*)/i);
            if (urlMatch) {
              return {
                url: urlMatch[1],
                type: 'hls',
                provider: 'vidsrc',
                referer: embedPath,
                subtitles: [],
              };
            }
          }
        } catch (e) {
          console.log('[VidSrc] API fetch failed:', e.message);
        }
      }
    }

    // Try to find sources in script tags with JSON-like objects
    const sourcesMatch = html.match(/sources\s*[:=]\s*\[([^\]]+)\]/);
    if (sourcesMatch) {
      const urlMatch = sourcesMatch[1].match(/['"]([^'"]*\.(?:m3u8|mp4)[^'"]*)['"]/);
      if (urlMatch) {
        return {
          url: urlMatch[1],
          type: urlMatch[1].includes('.m3u8') ? 'hls' : 'mp4',
          provider: 'vidsrc',
          referer: embedPath,
          subtitles: [],
        };
      }
    }

    console.log('[VidSrc] No stream URLs found');
    return null;

  } catch (err) {
    console.error('[VidSrc] Extraction failed:', err.message);
    return null;
  }
}
