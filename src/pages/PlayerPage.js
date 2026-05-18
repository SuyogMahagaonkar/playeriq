// ========================================
// PlayerIQ — Player Page (Cinema Mode)
// ========================================

import { getMovieDetails, getTVDetails, getSeasonDetails, img, NODE_PROXY } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { navigate } from '../services/router.js';
import { createVideoPlayer } from '../components/VideoPlayer.js';

import { saveProgress } from '../services/storage.js';

// Embed sources — using TMDB ID
// Nontongo is the primary working source (user-verified)
const SOURCES = [
  { id: 'nontongo', name: 'Nontongo', getMovieUrl: (id) => `https://www.nontongo.win/embed/movie/${id}`, getTVUrl: (id, s, e) => `https://www.nontongo.win/embed/tv/${id}/${s}/${e}` },
  { id: 'streamimdb', name: 'StreamIMDB', getMovieUrl: (id, imdb) => `https://streamimdb.ru/embed/movie/${imdb || id}`, getTVUrl: (id, s, e, imdb) => `https://streamimdb.ru/embed/tv/${imdb || id}/${s}/${e}` },
  { id: 'vidsrc_to', name: 'VidSrc TO (Dual Audio)', getMovieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`, getTVUrl: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  { id: 'smashystream', name: 'SmashyStream (Indian)', getMovieUrl: (id) => `https://embed.smashystream.com/playere.php?tmdb=${id}`, getTVUrl: (id, s, e) => `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}` },
  { id: 'superembed', name: 'SuperEmbed', getMovieUrl: (id) => `https://multiembed.mov/direct/super.php?video_id=${id}&tmdb=1`, getTVUrl: (id, s, e) => `https://multiembed.mov/direct/super.php?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
  { id: 'vidsrc_cc', name: 'VidSrc CC', getMovieUrl: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`, getTVUrl: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}` },
  { id: 'embed_su', name: 'Embed SU', getMovieUrl: (id) => `https://embed.su/embed/movie/${id}`, getTVUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
  { id: 'multiembed', name: 'MultiEmbed', getMovieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`, getTVUrl: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
  { id: 'autoembed', name: 'AutoEmbed', getMovieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}`, getTVUrl: (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}` },
];

let currentSourceIndex = parseInt(localStorage.getItem('piq_source') || '0');
if (currentSourceIndex >= SOURCES.length) currentSourceIndex = 0;

let currentPlayerMode = localStorage.getItem('piq_player_mode') || 'custom'; // 'custom' or 'embed'
let activePlayer = null;
let tmdbRuntimeSeconds = null; // TMDB runtime in seconds — used as duration fallback for slider
let episodeRuntimes = new Map(); // key: `S${season}E${ep}` — per-episode runtime in seconds

function getEmbedUrl(tmdbId, isTV, season = 1, episode = 1, imdbId = null) {
  const source = SOURCES[currentSourceIndex] || SOURCES[0];
  return isTV ? source.getTVUrl(tmdbId, season, episode, imdbId) : source.getMovieUrl(tmdbId, imdbId);
}

// ---- Redirect Protection ----
let _redirectGuardActive = false;
let _redirectCheckInterval;

function enableRedirectGuard() {
  if (_redirectGuardActive) return;
  _redirectGuardActive = true;
  window.addEventListener('beforeunload', _onBeforeUnload);
}

function disableRedirectGuard() {
  _redirectGuardActive = false;
  window.removeEventListener('beforeunload', _onBeforeUnload);
  if (_redirectCheckInterval) clearInterval(_redirectCheckInterval);
}

function _onBeforeUnload(e) {
  if (_redirectGuardActive && window.location.hash.includes('/watch/')) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
}

// ---- Fullscreen Toggle ----
function toggleFullscreen() {
  const wrapper = document.getElementById('video-wrapper');
  if (!wrapper) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    wrapper.requestFullscreen?.();
  }
}

// Listen for fullscreen changes to update the button icon
function _onFullscreenChange() {
  const expandIcon = document.querySelector('.player-fs-btn .fs-expand');
  const shrinkIcon = document.querySelector('.player-fs-btn .fs-shrink');
  if (!expandIcon || !shrinkIcon) return;
  if (document.fullscreenElement) {
    expandIcon.style.display = 'none';
    shrinkIcon.style.display = 'block';
  } else {
    expandIcon.style.display = 'block';
    shrinkIcon.style.display = 'none';
  }
}
document.addEventListener('fullscreenchange', _onFullscreenChange);

// ---- Player Loader (Custom + Fallback) ----
async function loadPlayer(id, isTV, season, episode, title, imdbId, posterPath = null, backdropPath = null) {
  const wrapper = document.getElementById('video-wrapper');
  if (!wrapper) return;

  // Cleanup existing player
  if (activePlayer) {
    activePlayer.destroy();
    activePlayer = null;
  }

  // Preserve the fullscreen button if it exists
  const fsBtn = wrapper.querySelector('.player-fs-btn');
  const fsBtnClone = fsBtn ? fsBtn.cloneNode(true) : null;

  // Show loading overlay
  wrapper.innerHTML = `
    <div class="player-loading-overlay" id="player-loading">
      <div class="player-loading-spinner"></div>
      <div class="player-loading-text" id="player-loading-text">Fetching stream...</div>
    </div>
  `;

  // ---- Stream fetch timeout: 60s with live countdown ----
  // On production the VPS MovieBox scrape can take 10–40s.
  // We show a live status message so the user knows it's working,
  // then gracefully fall back to iframe if it takes too long.
  const STREAM_TIMEOUT_MS = 60000;

  // Determine if we should try custom player
  if (currentPlayerMode === 'custom') {
    let countdownInterval = null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    // Live countdown in the loading text
    let elapsed = 0;
    const loadingTextEl = () => document.getElementById('player-loading-text');
    countdownInterval = setInterval(() => {
      elapsed += 1;
      const el = loadingTextEl();
      if (el) el.textContent = `Fetching stream... (${elapsed}s)`;
    }, 1000);

    const clearTimers = () => {
      clearTimeout(timeoutId);
      clearInterval(countdownInterval);
    };

    try {
      const endpoint = isTV
        ? `/api/stream/tv/${id}/${season}/${episode}`
        : `/api/stream/movie/${id}`;

      // Use NODE_PROXY (production API URL) — NOT localhost.
      // On local dev, Vite proxies /api/* to localhost:8788 automatically.
      const res = await fetch(`${NODE_PROXY}${endpoint}`, { signal: controller.signal });
      clearTimers();

      if (res.ok) {
        const streamData = await res.json();

        // Inject TMDB runtime as duration fallback if MovieBox didn't provide one
        if (!streamData.duration && tmdbRuntimeSeconds) {
          streamData.duration = tmdbRuntimeSeconds;
        }

        // ---- Bug fix: rewrite relative /api/* proxy URLs to absolute ----
        // The Node proxy returns stream/transcode/segment URLs as relative paths
        // (e.g. /api/proxy/transcode?...). On GitHub Pages these resolve against
        // the GitHub Pages origin — NOT the VPS — so video.src breaks silently.
        // We must prefix them with NODE_PROXY before handing to VideoPlayer.
        const toAbsolute = (url) => {
          if (!url) return url;
          if (url.startsWith('/api/')) return `${NODE_PROXY}${url}`;
          return url;
        };
        streamData.url = toAbsolute(streamData.url);
        if (Array.isArray(streamData.all_streams)) {
          streamData.all_streams = streamData.all_streams.map(s => ({
            ...s,
            url: toAbsolute(s.url),
          }));
        }

        // Clear wrapper and init custom player
        wrapper.innerHTML = '';
        activePlayer = createVideoPlayer(wrapper, streamData, (currentTime, duration) => {
          // Save progress every 5 seconds (called by VideoPlayer)
          saveProgress({
            id,
            title,
            type: isTV ? 'tv' : 'movie',
            poster_path: posterPath,
            backdrop_path: backdropPath,
            season,
            episode,
            currentTime,
            duration
          });
        });
        return; // Success!
      } else {
        console.warn('Backend stream extraction failed, falling back to iframe');
      }
    } catch (err) {
      clearTimers();
      if (err.name === 'AbortError') {
        console.warn(`[Player] Stream fetch timed out after ${STREAM_TIMEOUT_MS / 1000}s, falling back to iframe`);
      } else {
        console.warn('Backend server not reachable, falling back to iframe', err);
      }
    }
  }

  // Fallback to Iframe Embed
  const embedUrl = getEmbedUrl(id, isTV, season, episode, imdbId);
  const iframe = document.createElement('iframe');
  iframe.id = 'player-iframe';
  iframe.src = embedUrl;
  iframe.title = title;
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('webkitallowfullscreen', '');
  iframe.setAttribute('mozallowfullscreen', '');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
  iframe.referrerPolicy = 'origin';
  iframe.style.cssText = 'width:100%;height:100%;border:none;position:relative;z-index:1;';

  iframe.onload = () => {
    const loadingEl = document.getElementById('player-loading');
    if (loadingEl) {
      loadingEl.style.opacity = '0';
      loadingEl.style.transition = 'opacity 0.4s';
      setTimeout(() => loadingEl.remove(), 400);
    }
  };

  wrapper.innerHTML = '';
  wrapper.appendChild(iframe);

  if (fsBtnClone) {
    fsBtnClone.addEventListener('click', toggleFullscreen);
    wrapper.appendChild(fsBtnClone);
  }
}

// ---- Keyboard shortcut handler ----
let _keyHandler = null;

function setupKeyboardShortcuts(config) {
  // Remove previous handler
  if (_keyHandler) window.removeEventListener('keydown', _keyHandler);

  _keyHandler = (e) => {
    // Don't capture if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch (e.key) {
      case 'f':
      case 'F':
        // Toggle fullscreen on the video wrapper (more reliable for nested iframes)
        toggleFullscreen();
        e.preventDefault();
        break;

      case 't':
      case 'T':
        // Toggle theater mode
        document.querySelector('.player-page')?.classList.toggle('theater-mode');
        e.preventDefault();
        break;

      case 'n':
      case 'N':
        // Next episode (TV only)
        if (config.isTV && config.onNextEpisode) {
          config.onNextEpisode();
          e.preventDefault();
        }
        break;

      case 'p':
      case 'P':
        // Previous episode (TV only)
        if (config.isTV && config.onPrevEpisode) {
          config.onPrevEpisode();
          e.preventDefault();
        }
        break;

      case 'Escape':
        // Exit theater mode or go back
        const playerPage = document.querySelector('.player-page');
        if (playerPage?.classList.contains('theater-mode')) {
          playerPage.classList.remove('theater-mode');
        }
        e.preventDefault();
        break;
    }
  };

  window.addEventListener('keydown', _keyHandler);
}

// ============================
// Main Render
// ============================
export async function renderPlayerPage({ params, container }) {
  const { type, id } = params;
  const isTV = type === 'tv';

  enableRedirectGuard();

  // Parse season/episode from hash query
  const hashQuery = window.location.hash.split('?')[1] || '';
  const urlParams = new URLSearchParams(hashQuery);
  let currentSeason = parseInt(urlParams.get('s')) || 1;
  let currentEpisode = parseInt(urlParams.get('e')) || 1;

  // Initial loading skeleton
  container.innerHTML = `
    <div class="player-page">
      <div class="player-top-bar">
        <div style="width:60px;height:28px;border-radius:6px;background:rgba(255,255,255,0.04)"></div>
        <div style="width:160px;height:18px;border-radius:4px;background:rgba(255,255,255,0.04)"></div>
        <div style="width:100px;height:28px;border-radius:6px;background:rgba(255,255,255,0.04)"></div>
      </div>
      <div class="player-video-wrapper" style="display:flex;align-items:center;justify-content:center;">
        <div class="player-loading-overlay">
          <div class="player-loading-spinner"></div>
          <div class="player-loading-text">Loading Player...</div>
        </div>
      </div>
    </div>
  `;

  try {
    const data = isTV ? await getTVDetails(id) : await getMovieDetails(id);
    const imdbId = data.imdb_id || data.external_ids?.imdb_id || id;
    const title = data.title || data.name;
    const year = (data.release_date || data.first_air_date || '').slice(0, 4);
    const rating = data.vote_average?.toFixed(1) || '—';
    const genres = (data.genres || []).map(g => g.name).join(' • ');
    const runtime = data.runtime ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m` : '';
    const similar = data.similar?.results?.slice(0, 12) || [];
    const poster_path = data.poster_path;

    // Store TMDB runtime in seconds for the video player duration fallback
    // Movies: data.runtime is in minutes. TV: episode_run_time is average per-episode.
    if (!isTV && data.runtime) {
      tmdbRuntimeSeconds = data.runtime * 60;
    } else if (isTV && data.episode_run_time?.length) {
      // Use average episode runtime as initial fallback;
      // will be overridden per-episode once episode list loads
      tmdbRuntimeSeconds = data.episode_run_time[0] * 60;
    } else {
      tmdbRuntimeSeconds = null;
    }

    // Save initial progress
    saveProgress({ id, title, type: isTV ? 'tv' : 'movie', poster_path, season: currentSeason, episode: currentEpisode });

    // Build seasons sidebar for TV
    let seasonsSidebarHTML = '';
    let totalEpisodes = 0;
    if (isTV && data.seasons?.length) {
      const validSeasons = data.seasons.filter(s => s.season_number > 0);
      const currentSeasonData = validSeasons.find(s => s.season_number === currentSeason);
      totalEpisodes = currentSeasonData?.episode_count || 0;
      seasonsSidebarHTML = `
        <div class="player-episodes-panel" id="episodes-panel">
          <div class="player-episodes-header">
            <h3>Episodes</h3>
            <select class="player-season-select" id="player-season-select">
              ${validSeasons.map(s => `
                <option value="${s.season_number}" ${s.season_number === currentSeason ? 'selected' : ''}>
                  Season ${s.season_number}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="player-episodes-list" id="player-episodes-list">
            <div class="player-loading-overlay" style="position:relative;min-height:200px;">
              <div class="player-loading-spinner"></div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="player-page animate-fade-in">
        <div class="player-top-bar">
          <button class="player-back" id="player-back">
            <i data-lucide="arrow-left"></i>
            <span>Back</span>
          </button>
          <div class="player-now-playing">
            <span class="player-now-title">${title}</span>
            ${isTV ? `<span class="player-now-ep">S${currentSeason} E${currentEpisode}</span>` : ''}
          </div>
          <div class="player-source-selector">
            <select class="player-source-select" id="mode-select" title="Player Mode">
              <option value="custom" ${currentPlayerMode === 'custom' ? 'selected' : ''}>Custom Player</option>
              <option value="embed" ${currentPlayerMode === 'embed' ? 'selected' : ''}>Iframe Embed</option>
            </select>
            <select class="player-source-select" id="source-select" title="Embed Source" style="display: ${currentPlayerMode === 'custom' ? 'none' : 'inline-block'}; margin-left: 8px;">
              ${SOURCES.map((s, i) => `
                <option value="${i}" ${i === currentSourceIndex ? 'selected' : ''}>${s.name}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="player-body ${isTV ? 'has-episodes' : ''}">
          <div class="player-main">
            <div class="player-video-wrapper" id="video-wrapper">
              <button class="player-fs-btn" id="player-fs-btn" title="Fullscreen (F)">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fs-expand"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fs-shrink" style="display:none"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              </button>
            </div>

            <div class="player-info">
              <h1 class="player-title">${title}</h1>
              <div class="player-meta">
                <span>⭐ ${rating}</span>
                ${year ? `<span>•</span><span>${year}</span>` : ''}
                ${runtime ? `<span>•</span><span>${runtime}</span>` : ''}
                <span>•</span>
                <span>${isTV ? 'TV Series' : 'Movie'}</span>
                ${genres ? `<span>•</span><span>${genres}</span>` : ''}
                ${isTV ? `<span>•</span><span>S${currentSeason} E${currentEpisode}</span>` : ''}
              </div>
              ${data.overview ? `<p class="player-overview">${data.overview}</p>` : ''}
            </div>

            <div class="player-shortcuts-hint">
              <span><kbd>F</kbd> Fullscreen</span>
              <span><kbd>T</kbd> Theater</span>
              ${isTV ? '<span><kbd>N</kbd> Next</span><span><kbd>P</kbd> Prev</span>' : ''}
              <span><kbd>Esc</kbd> Exit</span>
            </div>
          </div>

          ${seasonsSidebarHTML}
        </div>

        ${similar.length ? `
          <div class="player-related">
            <h2 class="player-related-title">More Like This</h2>
            <div class="player-related-grid">
              ${similar.map(m => createMovieCard(m, type)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // ---- Load the embed ----
    const cleanTitle = title.replace(/\[.*?\]/g, '').trim();

    // For TV: load episode list FIRST so episodeRuntimes is populated
    // before loadPlayer runs, giving the player the correct episode duration.
    if (isTV) {
      const loadedEpCount = await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year);
      if (loadedEpCount > 0) totalEpisodes = loadedEpCount;
      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path);
    } else {
      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path);
    }

    // ---- Helper functions for episode navigation ----
    function goToEpisode(season, episode) {
      currentSeason = season;
      currentEpisode = episode;

      // Update progress
      saveProgress({ id, title, type: 'tv', poster_path: data.poster_path, backdrop_path: data.backdrop_path, season: currentSeason, episode: currentEpisode });

      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path);
      updateNowPlaying(currentSeason, currentEpisode);
      loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year);
    }

    function nextEpisode() {
      if (currentEpisode < totalEpisodes) {
        goToEpisode(currentSeason, currentEpisode + 1);
      }
    }

    function prevEpisode() {
      if (currentEpisode > 1) {
        goToEpisode(currentSeason, currentEpisode - 1);
      }
    }

    // ---- Keyboard Shortcuts ----
    setupKeyboardShortcuts({
      isTV,
      onNextEpisode: nextEpisode,
      onPrevEpisode: prevEpisode,
    });

    // ---- Event Listeners ----

    // Back button
    document.getElementById('player-back')?.addEventListener('click', () => {
      disableRedirectGuard();
      navigate(`/${type}/${id}`);
    });

    // Fullscreen button
    document.getElementById('player-fs-btn')?.addEventListener('click', toggleFullscreen);

    // Source selector
    document.getElementById('source-select')?.addEventListener('change', (e) => {
      currentSourceIndex = parseInt(e.target.value);
      localStorage.setItem('piq_source', currentSourceIndex);
      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path);
    });

    // Mode selector
    document.getElementById('mode-select')?.addEventListener('change', (e) => {
      currentPlayerMode = e.target.value;
      localStorage.setItem('piq_player_mode', currentPlayerMode);

      const sourceSelect = document.getElementById('source-select');
      if (sourceSelect) {
        sourceSelect.style.display = currentPlayerMode === 'custom' ? 'none' : 'inline-block';
      }

      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path);
    });

    // TV season/episode handling
    if (isTV && data.seasons?.length) {
      await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year);

      document.getElementById('player-season-select')?.addEventListener('change', async (e) => {
        currentSeason = parseInt(e.target.value);
        currentEpisode = 1;
        // Update total episodes from the actual loaded season
        totalEpisodes = await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year);
        loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path);
        updateNowPlaying(currentSeason, currentEpisode);
      });
    }

    attachCardClicks(container);
    if (window.lucide) window.lucide.createIcons();

    // Cleanup function
    return () => {
      disableRedirectGuard();
      if (_keyHandler) {
        window.removeEventListener('keydown', _keyHandler);
        _keyHandler = null;
      }
      if (activePlayer) {
        activePlayer.destroy();
        activePlayer = null;
      }
    };

  } catch (err) {
    console.error('Player page error:', err);
    container.innerHTML = `
      <div class="player-container">
        <button class="player-back-btn" onclick="window.history.back()">
          <i data-lucide="arrow-left" style="width:24px;height:24px"></i>
        </button>
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;color:white;flex-direction:column;gap:16px;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;opacity:0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style="font-size:1.2rem;font-weight:500;">Failed to load player</div>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

// ---- Helpers ----
function updateNowPlaying(season, episode) {
  const epEl = document.querySelector('.player-now-ep');
  if (epEl) epEl.textContent = `S${season} E${episode}`;
}

async function loadPlayerEpisodes(tvId, seasonNumber, activeEpisode = 1, title = '', posterPath = null, backdropPath = null, cleanTitle = null, year = null) {
  const listEl = document.getElementById('player-episodes-list');
  if (!listEl) return;
  listEl.innerHTML = `
    <div class="player-loading-overlay" style="position:relative;min-height:200px;">
      <div class="player-loading-spinner"></div>
    </div>
  `;

  try {
    const season = await getSeasonDetails(tvId, seasonNumber, cleanTitle, year);
    listEl.innerHTML = (season.episodes || []).map(ep => `
      <div class="player-episode-item ${ep.episode_number === activeEpisode ? 'active' : ''}" 
           data-episode="${ep.episode_number}" data-season="${seasonNumber}">
        <div class="player-episode-num">${ep.episode_number}</div>
        <div class="player-episode-info">
          <div class="player-episode-name">${ep.name || `Episode ${ep.episode_number}`}</div>
          <div class="player-episode-runtime">${ep.runtime ? `${ep.runtime} min` : ''}</div>
        </div>
        ${ep.episode_number === activeEpisode ? '<div class="player-episode-playing">▶ Now Playing</div>' : ''}
      </div>
    `).join('');

    // Store per-episode runtimes for use by the video player
    (season.episodes || []).forEach(ep => {
      if (ep.runtime) {
        episodeRuntimes.set(`S${seasonNumber}E${ep.episode_number}`, ep.runtime * 60);
      }
    });

    // Set tmdbRuntimeSeconds to the active episode's runtime right away
    const activeEpRuntime = episodeRuntimes.get(`S${seasonNumber}E${activeEpisode}`);
    if (activeEpRuntime) tmdbRuntimeSeconds = activeEpRuntime;

    // Episode click handlers
    listEl.querySelectorAll('.player-episode-item').forEach(item => {
      item.addEventListener('click', () => {
        const epNum = parseInt(item.dataset.episode);
        const sNum = parseInt(item.dataset.season);

        // Update runtime BEFORE loadPlayer so the player gets the right duration
        const epRuntime = episodeRuntimes.get(`S${sNum}E${epNum}`);
        if (epRuntime) tmdbRuntimeSeconds = epRuntime;

        // Load the episode
        loadPlayer(tvId, true, sNum, epNum, title, null, posterPath, backdropPath);

        // Update active state
        listEl.querySelectorAll('.player-episode-item').forEach(el => {
          el.classList.remove('active');
          const playingTag = el.querySelector('.player-episode-playing');
          if (playingTag) playingTag.remove();
        });
        item.classList.add('active');
        item.insertAdjacentHTML('beforeend', '<div class="player-episode-playing">▶ Now Playing</div>');

        updateNowPlaying(sNum, epNum);
      });
    });

    // Scroll active episode into view
    const activeEl = listEl.querySelector('.player-episode-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });

    return (season.episodes || []).length;

  } catch (err) {
    listEl.innerHTML = '<p style="color:var(--text-muted);padding:var(--space-md)">Failed to load episodes.</p>';
    return 0;
  }
}
