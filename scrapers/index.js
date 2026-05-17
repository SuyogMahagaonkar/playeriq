// ========================================
// PlayerIQ — Scraper Registry
// ========================================

import { extractNontongo } from './nontongo.js';
import { extractVidsrc } from './vidsrc.js';

const providers = [
  { name: 'Nontongo', extract: extractNontongo },
  { name: 'VidSrc CC', extract: extractVidsrc },
];

/**
 * Try each provider in order until one returns a valid stream
 * @param {'movie'|'tv'} type
 * @param {string} tmdbId
 * @param {number} season
 * @param {number} episode
 * @returns {Promise<{url, type, provider, referer, subtitles}|null>}
 */
export async function getStreams(type, tmdbId, season = 1, episode = 1) {
  for (const provider of providers) {
    console.log(`[Scraper] Trying ${provider.name}...`);
    try {
      const result = await provider.extract(type, tmdbId, season, episode);
      if (result && result.url) {
        console.log(`[Scraper] ✓ ${provider.name} returned stream: ${result.url.slice(0, 80)}...`);
        return result;
      }
    } catch (err) {
      console.error(`[Scraper] ✗ ${provider.name} failed:`, err.message);
    }
  }
  console.log('[Scraper] All providers failed');
  return null;
}
