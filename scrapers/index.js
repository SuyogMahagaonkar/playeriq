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
  console.log(`[Scraper] Running all scrapers in parallel for ${type} ${tmdbId}...`);
  
  const promises = providers.map(provider => {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await provider.extract(type, tmdbId, season, episode);
        if (result && result.url) {
          console.log(`[Scraper] ✓ ${provider.name} returned stream: ${result.url.slice(0, 80)}...`);
          resolve(result);
        } else {
          reject(new Error(`${provider.name} returned no stream`));
        }
      } catch (err) {
        reject(err);
      }
    });
  });

  try {
    const fastestResult = await Promise.any(promises);
    return fastestResult;
  } catch (err) {
    console.log('[Scraper] All providers failed or returned no streams');
    return null;
  }
}
