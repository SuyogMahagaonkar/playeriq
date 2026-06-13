// ========================================
// PlayerIQ — Intelligent Source Validator
// ========================================
// Runs silently in the background AFTER the Custom Video Player loads.
// Results are stored in sessionStorage and used to enrich the source dropdown
// automatically — when the user opens it, they see live/pre-validated results.

import { NODE_PROXY } from './api.js';

// Badge config: id → { label, colorClass, icon (lucide name) }
export const BADGE_CONFIG = {
  recommended: { label: 'Recommended', colorClass: 'sv-badge-recommended', icon: 'star' },
  available:   { label: 'Available',   colorClass: 'sv-badge-available',   icon: 'check-circle' },
  dual_audio:  { label: 'Dual Audio',  colorClass: 'sv-badge-dual',        icon: 'volume-2' },
  indian:      { label: 'Indian',      colorClass: 'sv-badge-indian',      icon: 'globe' },
  uncertain:   { label: 'Uncertain',   colorClass: 'sv-badge-uncertain',   icon: 'alert-triangle' },
  unavailable: { label: 'Unavailable', colorClass: 'sv-badge-unavailable', icon: 'x-circle' },
};

// Active validation promises (keyed by cache key) — prevents duplicate parallel calls
const _inFlight = new Map();

// Callbacks registered by UI components to receive live updates
const _listeners = new Map();

/**
 * Register a callback that fires whenever validation results update.
 * Returns an unsubscribe function.
 */
export function onValidationUpdate(cacheKey, callback) {
  if (!_listeners.has(cacheKey)) _listeners.set(cacheKey, new Set());
  _listeners.get(cacheKey).add(callback);
  return () => _listeners.get(cacheKey)?.delete(callback);
}

function _notify(cacheKey, results, status) {
  _listeners.get(cacheKey)?.forEach(cb => {
    try { cb({ results, status }); } catch(e) {}
  });
}

/**
 * Main entry point. Call this AFTER Custom Video Player has mounted.
 * Non-blocking — fires and forgets. UI subscribes via onValidationUpdate().
 *
 * @param {string|number} tmdbId
 * @param {string|null}   imdbId
 * @param {string}        type     'movie' | 'tv'
 * @param {number}        season
 * @param {number}        episode
 * @returns {Promise<Array>}  Resolves with sorted result array when done
 */
export async function validateSources(tmdbId, imdbId, type = 'movie', season = 1, episode = 1) {
  const cacheKey = `piq_sv_${type}_${tmdbId}_${season}_${episode}`;

  // 1. Return instantly from sessionStorage if we already have results
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      // Notify any active listeners with cached results
      _notify(cacheKey, data, 'cached');
      return data;
    }
  } catch(e) {}

  // 2. If another call is already in-flight for this same key, return that promise
  if (_inFlight.has(cacheKey)) {
    return _inFlight.get(cacheKey);
  }

  // 3. Fire the validation (non-blocking — caller doesn't need to await)
  const promise = (async () => {
    _notify(cacheKey, null, 'checking');
    try {
      const params = new URLSearchParams({
        tmdbId: String(tmdbId),
        imdbId: imdbId || '',
        type,
        season: String(season),
        episode: String(episode),
      });
      const res = await fetch(`${NODE_PROXY}/api/validate/sources?${params}`, {
        signal: AbortSignal.timeout(35000), // 35s max (server does 5s per source, 9 parallel)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = data.results || [];

      // Cache in sessionStorage for this browser session
      try { sessionStorage.setItem(cacheKey, JSON.stringify(results)); } catch(e) {}

      _notify(cacheKey, results, 'done');
      _inFlight.delete(cacheKey);
      return results;

    } catch(err) {
      console.warn('[SourceValidator] Falling back to unvalidated sources:', err.message);
      // Graceful fallback — return all sources as "uncertain" so the dropdown still works
      const fallback = getFallbackSources();
      _notify(cacheKey, fallback, 'fallback');
      _inFlight.delete(cacheKey);
      return fallback;
    }
  })();

  _inFlight.set(cacheKey, promise);
  return promise;
}

/**
 * Synchronously get the current cached results for a content item (if available).
 * Returns null if validation hasn't completed yet.
 */
export function getCachedResults(tmdbId, type = 'movie', season = 1, episode = 1) {
  const cacheKey = `piq_sv_${type}_${tmdbId}_${season}_${episode}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch(e) { return null; }
}

/**
 * Returns all sources as "uncertain" — used as a graceful fallback when
 * the proxy server is unreachable (e.g., GitHub Pages / offline users).
 */
export function getFallbackSources() {
  return [
    { id: 'nontongo',      name: 'Nontongo',       tag: 'General',    available: null, score: 50, badge: 'uncertain' },
    { id: 'vidsrc_to',     name: 'VidSrc TO',      tag: 'Dual Audio', available: null, score: 45, badge: 'uncertain' },
    { id: 'smashystream',  name: 'SmashyStream',   tag: 'Indian',     available: null, score: 40, badge: 'uncertain' },
    { id: 'streamimdb',    name: 'StreamIMDB',     tag: 'General',    available: null, score: 35, badge: 'uncertain' },
    { id: 'superembed',    name: 'SuperEmbed',     tag: 'General',    available: null, score: 30, badge: 'uncertain' },
    { id: 'vidsrc_cc',     name: 'VidSrc CC',      tag: 'General',    available: null, score: 25, badge: 'uncertain' },
    { id: 'embed_su',      name: 'Embed SU',       tag: 'General',    available: null, score: 20, badge: 'uncertain' },
    { id: 'multiembed',    name: 'MultiEmbed',     tag: 'General',    available: null, score: 15, badge: 'uncertain' },
    { id: 'autoembed',     name: 'AutoEmbed',      tag: 'General',    available: null, score: 10, badge: 'uncertain' },
  ];
}

/**
 * Get the SOURCES array index for a given source id.
 * Used by PlayerPage.js to map validated results back to the SOURCES[] array.
 */
export const SOURCE_ID_TO_INDEX = {
  nontongo:     0,
  streamimdb:   1,
  vidsrc_to:    2,
  smashystream: 3,
  superembed:   4,
  vidsrc_cc:    5,
  embed_su:     6,
  multiembed:   7,
  autoembed:    8,
};

/**
 * Streams validation results using Server-Sent Events.
 * Calls `onSourceResult` for EACH source individually as it finishes checking
 * (in whatever order servers respond — fastest first).
 * Calls `onComplete` with the full sorted & ranked list when all are done.
 *
 * Returns the EventSource instance so the caller can close it early if needed,
 * or null if the result was served from cache.
 *
 * @param {string|number} tmdbId
 * @param {string|null}   imdbId
 * @param {string}        type            'movie' | 'tv'
 * @param {number}        season
 * @param {number}        episode
 * @param {Function}      onSourceResult  (result) => void  — called per server
 * @param {Function}      onComplete      (results) => void — called when all done
 * @returns {EventSource|null}
 */
// Per-title TTL cache: caches at the title+type level (not per-episode).
// Server availability doesn't change per-episode within a single show,
// so users binging episodes see instant results for the whole session.
const SV_TITLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function streamValidateSources(tmdbId, imdbId, type = 'movie', season = 1, episode = 1, onSourceResult, onComplete) {
  // Episode-level exact cache key (written on completion)
  const cacheKey = `piq_sv_${type}_${tmdbId}_${season}_${episode}`;
  // Title-level TTL cache key (shared across all episodes of the same show)
  const titleCacheKey = `piq_sv_title_${type}_${tmdbId}`;

  // 1. Check episode-level exact cache first (no TTL — fastest path)
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const results = JSON.parse(cached);
      results.forEach(r => onSourceResult(r));
      onComplete(results);
      return null;
    }
  } catch (e) {}

  // 2. Check title-level TTL cache — serves any episode of the same show
  //    if server results were validated within the last 5 minutes.
  try {
    const titleCached = sessionStorage.getItem(titleCacheKey);
    if (titleCached) {
      const { results, timestamp } = JSON.parse(titleCached);
      if (Date.now() - timestamp < SV_TITLE_CACHE_TTL_MS) {
        // Store under the episode key too for future exact lookups
        try { sessionStorage.setItem(cacheKey, JSON.stringify(results)); } catch (_) {}
        results.forEach(r => onSourceResult(r));
        onComplete(results);
        return null;
      } else {
        // Expired — clean up
        sessionStorage.removeItem(titleCacheKey);
      }
    }
  } catch (e) {}

  // If EventSource is not supported, fall back to batch fetch
  if (typeof EventSource === 'undefined') {
    validateSources(tmdbId, imdbId, type, season, episode)
      .then(results => { results.forEach(r => onSourceResult(r)); onComplete(results); })
      .catch(() => { const fb = getFallbackSources(); fb.forEach(r => onSourceResult(r)); onComplete(fb); });
    return null;
  }

  const params = new URLSearchParams({
    tmdbId: String(tmdbId),
    imdbId: imdbId || '',
    type,
    season: String(season),
    episode: String(episode),
  });

  let es;
  try {
    es = new EventSource(`${NODE_PROXY}/api/validate/sources/stream?${params}`);
  } catch (e) {
    console.warn('[streamValidateSources] EventSource failed, batch fallback:', e.message);
    validateSources(tmdbId, imdbId, type, season, episode)
      .then(results => { results.forEach(r => onSourceResult(r)); onComplete(results); })
      .catch(() => { const fb = getFallbackSources(); fb.forEach(r => onSourceResult(r)); onComplete(fb); });
    return null;
  }

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'result') {
        onSourceResult(data.result);
      } else if (data.type === 'complete') {
        // Save to episode-level exact cache
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data.results)); } catch (e) {}
        // Save to title-level TTL cache (shared across episodes, expires after 5 min)
        try { sessionStorage.setItem(titleCacheKey, JSON.stringify({ results: data.results, timestamp: Date.now() })); } catch (e) {}
        onComplete(data.results);
        es.close();
      } else if (data.type === 'error') {
        console.warn('[streamValidateSources] Server signalled error, falling back');
        const fb = getFallbackSources();
        fb.forEach(r => onSourceResult(r));
        onComplete(fb);
        es.close();
      }
      // 'ping' frames are intentionally ignored
    } catch (e) {}
  };

  es.onerror = () => {
    console.warn('[streamValidateSources] SSE connection lost, batch fallback');
    es.close();
    validateSources(tmdbId, imdbId, type, season, episode)
      .then(results => { results.forEach(r => onSourceResult(r)); onComplete(results); })
      .catch(() => { const fb = getFallbackSources(); fb.forEach(r => onSourceResult(r)); onComplete(fb); });
  };

  return es;
}

