// ========================================
// PlayerIQ â€” Player Page (Cinema Mode)
// ========================================

import { getMovieDetails, getTVDetails, getSeasonDetails, getMediaImages, img, NODE_PROXY, findMovieBoxMatch } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { navigate } from '../services/router.js';
import { createVideoPlayer } from '../components/VideoPlayer.js';

import { saveProgress, getWatchHistory, getUser } from '../services/auth.js';
import { isInWatchlist, addToWatchlist, removeFromWatchlist } from '../services/firebase.js';
import { DownloadManager } from '../services/download.js';
import { validateSources, onValidationUpdate, getCachedResults, getFallbackSources, BADGE_CONFIG, SOURCE_ID_TO_INDEX, streamValidateSources } from '../services/SourceValidator.js';

// Embed sources â€” using TMDB ID
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
let iframeInterval = null;
let isOfflinePlayback = false;
let activeLogoUrl = null;
let activeTmdbId = null; // Persisted TMDB ID for background validation

// ---- Mini-player state (mobile only) ----
let _miniPlayerRoute = null;  // route string e.g. '/watch/movie/12345'
let _miniPlayerTitle = '';
let _miniPlayerPoster = '';
let _miniPlayerCleanup = null;

function _isMobileDevice() {
  return window.innerWidth <= 768 || ('ontouchstart' in window);
}

function showRotatePrompt() {
  if (!_isMobileDevice()) return;
  let prompt = document.getElementById('vp-rotate-prompt-global');
  if (!prompt) {
    prompt = document.createElement('div');
    prompt.id = 'vp-rotate-prompt-global';
    prompt.className = 'vp-rotate-prompt';
    prompt.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Rotate for better experience
    `;
    document.body.appendChild(prompt);
  }
  setTimeout(() => prompt.classList.add('visible'), 50);
  setTimeout(() => { prompt.classList.remove('visible'); setTimeout(() => prompt.remove(), 400); }, 3500);
}

function showMiniPlayer(videoEl, title, posterUrl, route) {
  if (!_isMobileDevice()) return;
  destroyMiniPlayer();

  _miniPlayerRoute = route;
  _miniPlayerTitle = title;
  _miniPlayerPoster = posterUrl;

  const mini = document.createElement('div');
  mini.id = 'vp-mini-player';
  mini.className = 'active';
  mini.setAttribute('role', 'complementary');
  mini.setAttribute('aria-label', 'Mini player â€” tap to restore');
  mini.innerHTML = `
    <img class="vp-mini-thumb" src="${posterUrl || ''}" alt="" onerror="this.style.display='none'">
    <div class="vp-mini-body" id="vp-mini-restore">
      <div class="vp-mini-title">${title}</div>
      <div class="vp-mini-sub">Tap to restore player</div>
    </div>
    <div class="vp-mini-controls">
      <button class="vp-mini-btn" id="vp-mini-playpause" aria-label="Play/Pause">
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>
      <button class="vp-mini-btn vp-mini-close-btn" id="vp-mini-close" aria-label="Close mini player">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(mini);

  // Restore: navigate back to watch route
  document.getElementById('vp-mini-restore')?.addEventListener('click', () => {
    destroyMiniPlayer();
    if (_miniPlayerRoute) window.location.hash = '#' + _miniPlayerRoute;
  });
  mini.querySelector('.vp-mini-thumb')?.addEventListener('click', () => {
    destroyMiniPlayer();
    if (_miniPlayerRoute) window.location.hash = '#' + _miniPlayerRoute;
  });

  // Play/pause button
  const ppBtn = document.getElementById('vp-mini-playpause');
  function updateMiniPP() {
    if (!videoEl || !ppBtn) return;
    const paused = videoEl.paused;
    ppBtn.innerHTML = paused
      ? `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  }
  if (videoEl) {
    videoEl.addEventListener('play',  updateMiniPP);
    videoEl.addEventListener('pause', updateMiniPP);
    updateMiniPP();
  }
  ppBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!videoEl) return;
    videoEl.paused ? videoEl.play() : videoEl.pause();
  });

  // Close
  document.getElementById('vp-mini-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (videoEl) videoEl.pause();
    destroyMiniPlayer();
  });
}

function destroyMiniPlayer() {
  const existing = document.getElementById('vp-mini-player');
  if (existing) existing.remove();
}

function clearIframeTracker() {
  if (iframeInterval) {
    clearInterval(iframeInterval);
    iframeInterval = null;
  }
}

function startIframeTracker(id, isTV, season, episode, title, posterPath, backdropPath) {
  clearIframeTracker();

  getSavedPlaybackTime(id, isTV, season, episode).then(startTime => {
    let simulatedCurrentTime = startTime || 0;
    let lastSaveTime = Date.now();

    const duration = isTV 
      ? (episodeRuntimes.get(`S${season}E${episode}`) || tmdbRuntimeSeconds || 1200)
      : (tmdbRuntimeSeconds || 6000);

    console.log(`[Iframe Tracker] Init: ${title} S${season}E${episode}. Saved startTime: ${simulatedCurrentTime}s, duration: ${duration}s`);

    iframeInterval = setInterval(async () => {
      // Accumulate watched time only if the tab is currently focused
      if (!document.hasFocus()) return;

      const now = Date.now();
      const deltaSeconds = Math.round((now - lastSaveTime) / 1000);
      lastSaveTime = now;

      if (deltaSeconds <= 0) return;

      simulatedCurrentTime += deltaSeconds;

      if (simulatedCurrentTime >= duration) {
        simulatedCurrentTime = duration;
      }

      // Extract episode metadata if TV
      let epStill = backdropPath || posterPath;
      let epTitle = '';
      let epOverview = '';
      if (isTV) {
        const details = episodeDetails.get(`S${season}E${episode}`);
        if (details) {
          if (details.still_path) {
            epStill = img.still(details.still_path);
          }
          epTitle = details.name;
          epOverview = details.overview;
        }
      }

      await saveProgress({
        id,
        title,
        type: isTV ? 'tv' : 'movie',
        poster_path: posterPath,
        backdrop_path: backdropPath,
        season,
        episode,
        currentTime: simulatedCurrentTime,
        duration,
        episode_title: epTitle,
        episode_still: epStill,
        episode_overview: epOverview,
        logo_path: activeLogoUrl
      });

      // Stop tracking if fully watched (90% watch threshold or under 5 min left)
      const simulatedPct = duration > 0 ? (simulatedCurrentTime / duration) : 0;
      if (simulatedPct >= 0.90 || (duration - simulatedCurrentTime <= 300)) {
        console.log('[Iframe Tracker] Fully watched (90% watched or under 5 min remaining). Clearing.');
        clearInterval(iframeInterval);
        iframeInterval = null;
      }
    }, 5000);
  });
}

let tmdbRuntimeSeconds = null; // TMDB runtime in seconds â€” used as duration fallback for slider
let episodeRuntimes = new Map(); // key: `S${season}E${ep}` â€” per-episode runtime in seconds
let episodeDetails = new Map(); // key: `S${season}E${ep}` â€” episode metadata (still_path, name, overview)
let totalEpisodes = 0;
let currentSeasonEpisodes = []; // Cached episodes list for in-player navigation
let currentEpisodesPage = 1;
const EPISODES_PER_PAGE = 10;

async function cacheSeasonEpisodesWithProgress(tvId, seasonNumber, episodes) {
  try {
    const history = await getWatchHistory().catch(() => []);
    currentSeasonEpisodes = episodes.map(ep => {
      const match = history.find(item => 
        String(item.id) === String(tvId) && 
        item.type === 'tv' && 
        Number(item.season) === Number(seasonNumber) && 
        Number(item.episode) === Number(ep.episode_number)
      );
      return {
        ...ep,
        progress: match && match.duration > 0 ? (match.currentTime / match.duration) * 100 : 0
      };
    });
  } catch (err) {
    console.warn('[cacheSeasonEpisodesWithProgress] failed:', err);
    currentSeasonEpisodes = episodes;
  }
}

function getEmbedUrl(tmdbId, isTV, season = 1, episode = 1, imdbId = null) {
  const source = SOURCES[currentSourceIndex] || SOURCES[0];
  const realId = activeTmdbId || tmdbId;
  return isTV ? source.getTVUrl(realId, season, episode, imdbId) : source.getMovieUrl(realId, imdbId);
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
  clearIframeTracker();
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

// ---- Fetch Saved Watch Progress ----
async function getSavedPlaybackTime(id, isTV, season, episode) {
  try {
    const history = await getWatchHistory();
    const match = history.find(item => {
      if (isTV) {
        return String(item.id) === String(id) && 
               item.type === 'tv' && 
               Number(item.season) === Number(season) && 
               Number(item.episode) === Number(episode);
      } else {
        return String(item.id) === String(id) && 
               item.type === 'movie';
      }
    });
    if (match) {
      // If already watched, 90% watched, or less than 5 minutes remaining, play from start
      if (match.watched) return 0;
      const matchPct = match.duration > 0 ? (match.currentTime / match.duration) : 0;
      if (match.duration > 0 && (matchPct >= 0.90 || (match.duration - match.currentTime <= 300))) return 0;

      if (match.currentTime > 0 && match.duration > 0) {
        const percent = (match.currentTime / match.duration) * 100;
        if (percent < 95 && match.currentTime > 5) {
          return Math.floor(match.currentTime);
        }
      }
    }
  } catch (err) {
    console.warn('[Playback Restore] Failed to fetch saved progress:', err);
  }
  return 0;
}

// ---- Player Loader (Custom + Fallback) ----
async function loadPlayer(id, isTV, season, episode, title, imdbId, posterPath = null, backdropPath = null, onEnded = null, onNextEpisodeClick = null, goToEpisode = null) {
  const wrapper = document.getElementById('video-wrapper');
  if (!wrapper) return;

  if (!navigator.onLine || isOfflinePlayback) {
    currentPlayerMode = 'custom';
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) modeSelect.value = 'custom';
  }

  clearIframeTracker();

  const startTime = await getSavedPlaybackTime(id, isTV, season, episode);
  if (startTime > 0) {
    console.log(`[Playback Restore] Resuming playback from ${startTime}s...`);
  }

  function showNextEpisodeFloatingButton(nextEpNum) {
    let btn = wrapper.querySelector('.vp-next-overlay-btn');
    if (btn) return; // Already exists

    btn = document.createElement('button');
    btn.className = 'vp-next-overlay-btn';
    btn.style.cssText = `
      position: absolute;
      bottom: 100px;
      right: 40px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.15);
      color: #000000;
      padding: 14px 32px;
      border-radius: 2px;
      font-family: inherit;
      font-weight: 800;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      z-index: 100;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      transition: all 0.25s ease;
      opacity: 0;
      transform: translateY(15px);
    `;

    btn.innerHTML = `
      <span>Next Episode</span>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><rect x="17" y="4" width="2" height="16"></rect></svg>
    `;

    wrapper.appendChild(btn);

    // Trigger visual entry transition
    requestAnimationFrame(() => {
      btn.style.opacity = '1';
      btn.style.transform = 'none';
    });

    // Hover effects
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#000000';
      btn.style.color = '#ffffff';
      btn.style.borderColor = 'rgba(255,255,255,0.8)';
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 12px 40px rgba(0,0,0,0.7)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#ffffff';
      btn.style.color = '#000000';
      btn.style.borderColor = 'rgba(0, 0, 0, 0.15)';
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    });

    // Click trigger
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.remove();
      if (onNextEpisodeClick) {
        onNextEpisodeClick();
      } else if (onEnded) {
        onEnded();
      }
    });
  }

  function hideNextEpisodeFloatingButton() {
    const btn = wrapper.querySelector('.vp-next-overlay-btn');
    if (btn) {
      btn.style.opacity = '0';
      btn.style.transform = 'translateX(20px)';
      setTimeout(() => btn.remove(), 300);
    }
  }

  // Cleanup existing player
  if (activePlayer) {
    const wasFullscreen = !!document.fullscreenElement;
    activePlayer.destroy(false, wasFullscreen);
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
  // On production the VPS MovieBox scrape can take 10â€“40s.
  // We show a live status message so the user knows it's working,
  // then gracefully fall back to iframe if it takes too long.
  const STREAM_TIMEOUT_MS = 60000;

  // Determine if we should try custom player
  if (currentPlayerMode === 'custom') {
    const downloads = await DownloadManager.list();
    const downloadId = isTV ? `tv_${id}_s${season}_e${episode}` : `movie_${id}`;
    const match = downloads.find(x => x.id === downloadId && x.status === 'COMPLETED');

    const playOfflineMatch = async (downloadedMatch) => {
      let localUrl = '';
      if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
        localUrl = await DownloadManager.getOfflineUrl(downloadedMatch.id);
      } else {
        // Fallback demo video for web
        localUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
      }

      const streamData = {
        id: downloadedMatch.id,
        url: localUrl,
        type: 'mp4',
        isOffline: true,
        duration: downloadedMatch.type === 'movie' ? 120 * 60 : 45 * 60,
        title: downloadedMatch.title,
        poster: downloadedMatch.posterPath,
        provider: 'Offline Local File',
        isTV: isTV
      };

      if (tmdbRuntimeSeconds) {
        streamData.duration = tmdbRuntimeSeconds;
      }

      // Clear wrapper and init custom player
      wrapper.innerHTML = '';
      activePlayer = createVideoPlayer(
        wrapper,
        streamData,
        {
          onProgress: (currentTime, duration) => {
            let epStill = posterPath;
            let epTitle = '';
            let epOverview = '';
            if (isTV) {
              epTitle = `Episode ${episode}`;
              epOverview = 'Offline playback from IndexedDB.';
            }

            saveProgress({
              id,
              title,
              type: isTV ? 'tv' : 'movie',
              poster_path: posterPath,
              backdrop_path: backdropPath,
              season,
              episode,
              currentTime,
              duration,
              episode_title: epTitle,
              episode_still: epStill,
              episode_overview: epOverview
            });

            // Floating Next Episode button in last 60 seconds
            const remaining = duration - currentTime;
            const nextEpNum = episode + 1;
            if (isTV && nextEpNum <= totalEpisodes && remaining <= 60 && remaining > 0) {
              showNextEpisodeFloatingButton(nextEpNum);
            } else {
              hideNextEpisodeFloatingButton();
            }
          },
          onFatalError: () => {
            console.warn('[Player] Offline player error callback');
          },
          onEnded,
          startTime,
          episodes: currentSeasonEpisodes,
          currentSeason: season,
          currentEpisode: episode,
          goToEpisode
        }
      );
    };

    // âœ… PRODUCTION: If user has downloaded this item, ALWAYS play the local file
    // This works whether online or offline â€” the downloaded copy takes priority
    if (match) {
      console.log(`[PlayerPage] Found completed local download for ${downloadId} â€” playing offline copy`);
      await playOfflineMatch(match);
      return;
    }

    if (!navigator.onLine || isOfflinePlayback) {
      console.log('[PlayerPage] Offline mode: no local copy found, showing error...');
      wrapper.innerHTML = `
          <div class="player-offline-error-overlay">
            <div class="player-offline-error-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.5"></path><path d="M5 12.5a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
            </div>
            <h3 class="player-offline-error-title">Not Downloaded</h3>
            <p class="player-offline-error-message">
              This title hasn't been downloaded. Please connect to the internet or go to Downloads to watch offline content.
            </p>
            <button class="player-offline-error-btn" onclick="window.location.hash = '#/downloads'">
              Go to Downloads
            </button>
          </div>
        `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

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

      // Use NODE_PROXY (production API URL) â€” NOT localhost.
      // On local dev, Vite proxies /api/* to localhost:8788 automatically.
      const res = await fetch(`${NODE_PROXY}${endpoint}`, { signal: controller.signal });
      clearTimers();

      if (res.ok) {
        const streamData = await res.json();
        streamData.isTV = isTV;

        // Inject TMDB runtime as duration fallback if MovieBox didn't provide one
        if (!streamData.duration && tmdbRuntimeSeconds) {
          streamData.duration = tmdbRuntimeSeconds;
        }

        // ---- Bug fix: rewrite relative /api/* proxy URLs to absolute ----
        // The Node proxy returns stream/transcode/segment URLs as relative paths
        // (e.g. /api/proxy/transcode?...). On GitHub Pages these resolve against
        // the GitHub Pages origin â€” NOT the VPS â€” so video.src breaks silently.
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

        const loadIframeFallback = async () => {
          console.warn('[Player] Loading fallback iframe embed...');
          if (match) {
            console.log('[PlayerPage] Switch to iframe bypassed. Local download found, playing offline...');
            await playOfflineMatch(match);
            return;
          }
          const embedUrl = getEmbedUrl(id, isTV, season, episode, imdbId);
          const iframe = document.createElement('iframe');
          iframe.id = 'player-iframe';
          iframe.src = embedUrl;
          iframe.title = title;
          iframe.setAttribute('allowfullscreen', '');
          iframe.setAttribute('webkitallowfullscreen', '');
          iframe.setAttribute('mozallowfullscreen', '');
          iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
          iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock');
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

          startIframeTracker(id, isTV, season, episode, title, posterPath, backdropPath);
        };

        // Clear wrapper and init custom player
        wrapper.innerHTML = '';
        activePlayer = createVideoPlayer(
          wrapper,
          streamData,
          {
            onProgress: (currentTime, duration) => {
              // Extract episode metadata if TV
              let epStill = backdropPath || posterPath;
              let epTitle = '';
              let epOverview = '';
              if (isTV) {
                const details = episodeDetails.get(`S${season}E${episode}`);
                if (details) {
                  if (details.still_path) {
                    epStill = img.still(details.still_path);
                  }
                  epTitle = details.name;
                  epOverview = details.overview;
                }
              }

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
                duration,
                episode_title: epTitle,
                episode_still: epStill,
                episode_overview: epOverview
              });

              // Floating Next Episode button in last 60 seconds
              const remaining = duration - currentTime;
              const nextEpNum = episode + 1;
              if (isTV && nextEpNum <= totalEpisodes && remaining <= 60 && remaining > 0) {
                showNextEpisodeFloatingButton(nextEpNum);
              } else {
                hideNextEpisodeFloatingButton();
              }
            },
            onFatalError: () => {
              // onFatalError callback
              console.warn('[Player] Custom player failed or timed out. Switching to iframe fallback...');
              if (activePlayer) {
                activePlayer.destroy();
                activePlayer = null;
              }
              loadIframeFallback();
            },
            onEnded,
            startTime,
            episodes: currentSeasonEpisodes,
            currentSeason: season,
            currentEpisode: episode,
            goToEpisode
          }
        );

        // MediaSession & Video Title: show title + artwork on lock screen/top bar
        if (wrapper._initMediaSession) {
          wrapper._initMediaSession(
            title,
            isTV ? `Season ${season} Â· Episode ${episode}` : '',
            posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '',
            null, // onPrev â€” wired up later via onNextEpisodeClick
            onNextEpisodeClick
          );
        }

        // ---- Mobile post-init: rotate-on-play + MediaSession ----
        if (_isMobileDevice()) {
          // Attempt landscape lock (works in installed PWA / Android Chrome)
          if (screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {
              // Graceful fallback: show "rotate your device" prompt
              showRotatePrompt();
            });
          } else {
            showRotatePrompt();
          }



          // Mini-player: when user navigates away mid-play
          const videoEl = wrapper.querySelector('video');
          const watchRoute = isTV ? `/watch/tv/${id}/${season}/${episode}` : `/watch/movie/${id}`;
          const hashChangeHandler = () => {
            const hash = window.location.hash || '';
            const isOnPlayerPage = hash.includes('/watch/');
            if (!isOnPlayerPage && videoEl && !videoEl.paused) {
              showMiniPlayer(videoEl, title, posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : '', watchRoute);
            } else {
              destroyMiniPlayer();
            }
          };
          window.addEventListener('hashchange', hashChangeHandler);
          // Cleanup on next player load
          _miniPlayerCleanup = () => window.removeEventListener('hashchange', hashChangeHandler);
        }

        // ---- Background Source Validation (fires AFTER player is ready) ----
        // Non-blocking: player is already playing. Validation runs silently via SSE.
        // Each server result streams in individually â€” the dropdown updates in real time
        // as each source check completes (fastest servers appear first).
        setTimeout(() => {
          // â”€â”€ Helper: update a single server item in the dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          const _updateSourceItem = (r) => {
            const list = document.getElementById('sv-list');
            if (!list) return;
            const item = list.querySelector(`.sv-item[data-id="${r.id}"]`);
            if (!item) return;

            item.classList.remove('sv-item-checking', 'sv-item-available', 'sv-item-uncertain', 'sv-item-unavailable', 'sv-item-recommended');
            const dot  = item.querySelector('.sv-item-dot');
            const stat = item.querySelector('.sv-item-status');

            if (r.available === true) {
              const cls = r.badge === 'recommended' ? 'sv-item-recommended' : 'sv-item-available';
              item.classList.add(cls);
              if (dot)  dot.className  = 'sv-item-dot sv-dot-available';
              if (stat) stat.textContent = r.badge === 'recommended' ? 'Recommended' : 'Available';
            } else if (r.available === null) {
              item.classList.add('sv-item-uncertain');
              if (dot)  dot.className  = 'sv-item-dot sv-dot-uncertain';
              if (stat) stat.textContent = 'Uncertain';
            } else {
              item.classList.add('sv-item-unavailable');
              if (dot)  dot.className  = 'sv-item-dot sv-dot-unavailable';
              if (stat) stat.textContent = 'Unavailable';
            }

            // Render badge chips
            const badgesEl = document.getElementById(`sv-badges-${r.id}`);
            if (badgesEl && BADGE_CONFIG[r.badge]) {
              const bc = BADGE_CONFIG[r.badge];
              const speedBadge = (r.responseMs && r.responseMs < 2000 && r.available)
                ? `<span class="sv-badge sv-badge-fast"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Fast</span>`
                : '';
              badgesEl.innerHTML = `<span class="sv-badge ${bc.colorClass}">${bc.label}</span>${speedBadge}`;
            }
          };

          // â”€â”€ Helper: finalise â€” re-sort list, update trigger button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          const _applyFinalSort = (results) => {
            const list         = document.getElementById('sv-list');
            const triggerLabel = document.getElementById('sv-trigger-label');
            const triggerDot   = document.getElementById('sv-trigger-dot');
            const checkingPill = document.getElementById('sv-checking-pill');

            if (checkingPill) checkingPill.style.display = 'none';
            if (!list) return;

            // Re-apply any badge changes that came from the sorted final list
            results.forEach(r => _updateSourceItem(r));

            // Re-order DOM elements to match sorted order
            results.forEach(r => {
              const item = list.querySelector(`.sv-item[data-id="${r.id}"]`);
              if (item) list.appendChild(item);
            });

            // Update trigger button label & dot colour
            const topSource = results.find(r => r.available === true) || results[0];
            if (topSource && triggerLabel) {
              triggerLabel.textContent = topSource.name;
              if (triggerDot) {
                triggerDot.className = topSource.available === true
                  ? 'sv-trigger-dot sv-dot-available'
                  : topSource.available === null
                    ? 'sv-trigger-dot sv-dot-uncertain'
                    : 'sv-trigger-dot sv-dot-unavailable';
              }
            }
          };

          // â”€â”€ Start validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          // streamValidateSources handles cache detection internally.
          // For fresh checks it opens an SSE connection and calls:
          //   onSourceResult(r)  â€” for each server the moment its check resolves
          //   onComplete(all)    â€” once every server is done, with sorted results
          const checkingPill = document.getElementById('sv-checking-pill');
          if (checkingPill) checkingPill.style.display = 'flex';

          streamValidateSources(
            activeTmdbId || id,
            imdbId,
            isTV ? 'tv' : 'movie',
            season,
            episode,
            _updateSourceItem,   // per-server live update
            _applyFinalSort      // final sort + trigger update
          );
        }, 0);

        return; // Success!
      } else {
        console.warn('Backend stream extraction failed, falling back to iframe');
        if (match) {
          console.log('[PlayerPage] Stream failed, local download found. Playing offline...');
          await playOfflineMatch(match);
          return;
        }
        // Let's execute fallback immediately
        const embedUrl = getEmbedUrl(id, isTV, season, episode, imdbId);
        const iframe = document.createElement('iframe');
        iframe.id = 'player-iframe';
        iframe.src = embedUrl;
        iframe.title = title;
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('webkitallowfullscreen', '');
        iframe.setAttribute('mozallowfullscreen', '');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock');
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

        startIframeTracker(id, isTV, season, episode, title, posterPath, backdropPath);
      }
    } catch (err) {
      clearTimers();
      if (match) {
        console.log('[PlayerPage] Server not reachable, local download found. Playing offline...');
        await playOfflineMatch(match);
        return;
      }
      if (err.name === 'AbortError') {
        console.warn(`[Player] Stream fetch timed out after ${STREAM_TIMEOUT_MS / 1000}s, falling back to iframe`);
      } else {
        console.warn('Backend server not reachable, falling back to iframe', err);
      }
      // Let's execute fallback immediately
      const embedUrl = getEmbedUrl(id, isTV, season, episode, imdbId);
      const iframe = document.createElement('iframe');
      iframe.id = 'player-iframe';
      iframe.src = embedUrl;
      iframe.title = title;
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('webkitallowfullscreen', '');
      iframe.setAttribute('mozallowfullscreen', '');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock');
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

      startIframeTracker(id, isTV, season, episode, title, data.poster_path, data.backdrop_path);
    }
    return;
  }

  // Fallback to Iframe Embed (standard when player mode is 'embed')
  const embedUrl = getEmbedUrl(id, isTV, season, episode, imdbId);
  const iframe = document.createElement('iframe');
  iframe.id = 'player-iframe';
  iframe.src = embedUrl;
  iframe.title = title;
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('webkitallowfullscreen', '');
  iframe.setAttribute('mozallowfullscreen', '');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock');
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

  startIframeTracker(id, isTV, season, episode, title, posterPath, backdropPath);
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

  activeTmdbId = id; // Sync original numerical TMDB ID for background validator

  enableRedirectGuard();

  // Parse season/episode from hash query
  const hashQuery = window.location.hash.split('?')[1] || '';
  const urlParams = new URLSearchParams(hashQuery);
  let currentSeason = parseInt(urlParams.get('s')) || 1;
  let currentEpisode = parseInt(urlParams.get('e')) || 1;

  // Initial loading skeleton
  if (window.innerWidth <= 767) {
    container.innerHTML = `
      <div class="player-page mobile-player-page">
        <div class="skeleton-player-wrapper">
          <div class="skeleton-player">
            <div class="skeleton-player-controls">
              <div class="skeleton-player-bar"></div>
              <div class="skeleton-player-row">
                <div class="skeleton-player-btn"></div>
                <div class="skeleton-player-time"></div>
                <div class="skeleton-player-btn"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
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
  }

  let data;
  isOfflinePlayback = false;
  activeLogoUrl = null;
  let activeId = id;

  // If launched from Downloads page, immediately use offline mode
  if (sessionStorage.getItem('piq_force_offline') === '1') {
    sessionStorage.removeItem('piq_force_offline');
    isOfflinePlayback = true;
    currentPlayerMode = 'custom';
  }

  try {
    let match = null;
    const downloads = await DownloadManager.list();

    if (isTV) {
      const prefix = `tv_${id}_`;
      match = downloads.find(x => x.id.startsWith(prefix) && x.status === 'COMPLETED');
    } else {
      const matchId = `movie_${id}`;
      match = downloads.find(x => x.id === matchId && x.status === 'COMPLETED');
    }

    if (!navigator.onLine) {
      if (match) {
        isOfflinePlayback = true;
        // Clean TV title format if present S1 E1: title
        const cleanName = match.title.split(': ').length > 1 ? match.title.split(': ').slice(1).join(': ') : match.title;
        data = {
          id: id,
          title: cleanName,
          name: cleanName,
          poster_path: match.posterPath,
          backdrop_path: match.posterPath,
          overview: `Offline Playback â€¢ Locally stored title inside IndexedDB.`,
          vote_average: 10.0,
          genres: [{ name: 'Offline' }],
          runtime: match.type === 'movie' ? 120 : 45,
          seasons: [{ season_number: currentSeason, episode_count: 10 }]
        };
      } else {
        throw new Error('OFFLINE_AND_NOT_DOWNLOADED');
      }
    } else {
      try {
        data = isTV ? await getTVDetails(id) : await getMovieDetails(id);
      } catch (fetchErr) {
        console.warn('[PlayerPage] Online details fetch failed. Checking for offline downloads fallback...', fetchErr);
        if (match) {
          console.log('[PlayerPage] Offline recovery: Completed local download found. Switching to offline playback...');
          isOfflinePlayback = true;
          const cleanName = match.title.split(': ').length > 1 ? match.title.split(': ').slice(1).join(': ') : match.title;
          data = {
            id: id,
            title: cleanName,
            name: cleanName,
            poster_path: match.posterPath,
            backdrop_path: match.posterPath,
            overview: `Offline Playback â€¢ Locally stored title inside IndexedDB.`,
            vote_average: 10.0,
            genres: [{ name: 'Offline' }],
            runtime: match.type === 'movie' ? 120 : 45,
            seasons: [{ season_number: currentSeason, episode_count: 10 }]
          };
        } else {
          console.error('[PlayerPage] Online details fetch failed and no local download exists.');
          throw new Error('OFFLINE_AND_NOT_DOWNLOADED');
        }
      }
    }

    // Dynamic background TMDB-to-MovieBox match resolver
    if (!String(id).startsWith('mb_') && navigator.onLine) {
      const loadingTextEl = document.getElementById('player-loading-text');
      if (loadingTextEl) {
        loadingTextEl.textContent = 'Resolving stream from MovieBox...';
      }
      const title = data.title || data.name;
      const year = (data.release_date || data.first_air_date || '').slice(0, 4);
      try {
        const mbMatch = await findMovieBoxMatch(title, year, type);
        if (mbMatch) {
          activeId = `mb_${mbMatch.subject_id || mbMatch.id || mbMatch.subjectId}`;
          console.log(`[PlayerPage] Resolved TMDB ID ${id} ("${title}") to MovieBox ID ${activeId}`);
        }
      } catch (err) {
        console.warn('[PlayerPage] Matching failed:', err);
      }
    } else if (String(id).startsWith('mb_') && navigator.onLine) {
      const title = data.title || data.name;
      const year = (data.release_date || data.first_air_date || '').slice(0, 4);
      try {
        const apiKey = '8e4ad9e56e31ab079517b5be6965b477';
        const cleanTitle = title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
        const searchType = isTV ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}${year ? `&year=${year}` : ''}`;
        const searchRes = await fetch(url);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData.results || [];
          if (results.length > 0) {
            const resolvedTmdbId = results[0].id;
            activeTmdbId = resolvedTmdbId;
            console.log(`[PlayerPage] Resolved MovieBox ID ${id} ("${title}") to TMDB ID ${resolvedTmdbId}`);
          }
        }
      } catch (err) {
        console.warn('[PlayerPage] MovieBox to TMDB ID resolution failed:', err);
      }
    }

    // Re-check completed downloads list with the newly resolved activeId
    if (activeId !== id) {
      if (isTV) {
        const prefix = `tv_${activeId}_`;
        const activeMatch = downloads.find(x => x.id.startsWith(prefix) && x.status === 'COMPLETED');
        if (activeMatch) match = activeMatch;
      } else {
        const matchId = `movie_${activeId}`;
        const activeMatch = downloads.find(x => x.id === matchId && x.status === 'COMPLETED');
        if (activeMatch) match = activeMatch;
      }
    }

    const imdbId = data.imdb_id || data.external_ids?.imdb_id || id;
    const title = data.title || data.name;
    const year = (data.release_date || data.first_air_date || '').slice(0, 4);
    const rating = data.vote_average?.toFixed(1) || 'â€”';
    const genres = (data.genres || []).map(g => g.name).join(' â€¢ ');
    const runtime = data.runtime ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m` : '';
    const similar = data.similar?.results?.slice(0, 12) || [];
    const poster_path = data.poster_path;

    // Fetch official English logo image
    let logoUrl = null;
    try {
      const images = await getMediaImages(id, type, title);
      if (images && images.logos?.length) {
        // Find best English logo or any logo
        const logo = images.logos.find(l => l.iso_639_1 === 'en') || images.logos[0];
        if (logo) {
          logoUrl = `https://image.tmdb.org/t/p/w500${logo.file_path}`;
        }
      }
    } catch (logoErr) {
      console.warn('[PlayerPage] Failed to fetch official logo:', logoErr);
    }
    activeLogoUrl = logoUrl;

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

    // ====================================================================
    // CAST FLOW INITIALIZATION & BINDING (Available to both Desktop & Mobile)
    // ====================================================================
    loadGoogleCastSDK();
    window._triggerCastingFlow = () => triggerCastDialog();

    function triggerCastDialog() {
      // 1. Iframe player is active — cast requires the custom HLS player
      if (document.getElementById('player-iframe')) {
        showCastUnsupportedToast('Switch to Custom Player to cast to your TV.');
        return;
      }

      // 2. Cast SDK not ready yet (fast click before SDK script finished loading)
      if (!window.cast || !cast.framework) {
        showCastUnsupportedToast(
          navigator.userAgent.includes('Chrome')
            ? 'Cast is loading \u2014 please try again in a moment.'
            : 'Casting requires Google Chrome or the PlayerIQ Android app.'
        );
        return;
      }

      const ctx = cast.framework.CastContext.getInstance();

      // 3. Already connected — load the current content into the existing session
      const existingSession = ctx.getCurrentSession();
      if (existingSession) {
        _loadMediaOnCast(existingSession);
        return;
      }

      // 4. Request a new cast session — shows the NATIVE Chrome device picker
      ctx.requestSession()
        .then(() => {
          const session = ctx.getCurrentSession();
          if (session) _loadMediaOnCast(session);
        })
        .catch((err) => {
          if (err === chrome.cast.ErrorCode.CANCEL) return; // User dismissed — not an error
          console.error('[Cast] requestSession failed:', err);
          showCastUnsupportedToast("Could not connect. Make sure you're on the same WiFi as your TV.");
        });
    }

    function _loadMediaOnCast(castSession) {
      const videoEl   = document.getElementById('vp-video');
      const resumeTime = videoEl ? videoEl.currentTime : 0;
      if (videoEl && !videoEl.paused) videoEl.pause();

      // Always use the production proxy URL (must be publicly accessible for Cast Receiver)
      const PROD_PROXY = 'https://playerapi.suyogmahagaonkar.me';
      const streamPath = isTV
        ? `/api/stream/tv/${activeTmdbId || id}/${currentSeason}/${currentEpisode}`
        : `/api/stream/movie/${activeTmdbId || id}`;
      const streamUrl = `${PROD_PROXY}${streamPath}`;

      // Build ChromeCast MediaInfo with HLS stream
      const mediaInfo = new chrome.cast.media.MediaInfo(streamUrl, 'application/x-mpegURL');
      mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;

      // Rich metadata shown on the TV screen
      const metadata = isTV
        ? new chrome.cast.media.TvShowMediaMetadata()
        : new chrome.cast.media.MovieMediaMetadata();
      metadata.title = title;
      if (isTV) {
        metadata.season  = currentSeason;
        metadata.episode = currentEpisode;
      }
      if (poster_path) {
        metadata.images = [new chrome.cast.Image(`https://image.tmdb.org/t/p/w500${poster_path}`)];
      }
      mediaInfo.metadata = metadata;

      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      request.currentTime = resumeTime; // Seamless timestamp handoff

      castSession.loadMedia(request)
        .then(() => {
          // Wire up the real RemotePlayerController for live state sync
          _castRemotePlayer = new cast.framework.RemotePlayer();
          _castController   = new cast.framework.RemotePlayerController(_castRemotePlayer);

          // When session ends from TV side: resume local video from cast position
          _castOnSessionEnd = () => {
            const vid = document.getElementById('vp-video');
            if (vid && _castRemotePlayer && _castRemotePlayer.currentTime > 0) {
              vid.currentTime = _castRemotePlayer.currentTime;
            }
            if (vid) vid.play().catch(() => {});
          };

          // Friendly device name from SDK (e.g. "Living Room TV", "Suyog's Android TV")
          const deviceName = castSession.getCastDevice()?.friendlyName || 'TV';
          mountGlobalCastBar(deviceName, title, data.backdrop_path || poster_path);
          pushTelemetry('cast_session_started', { deviceName, mediaId: id, resumeTime });

          console.log(`[Cast] Streaming to "${deviceName}" — ${isTV ? `S${currentSeason}E${currentEpisode}` : ''} t=${resumeTime.toFixed(1)}s`);
        })
        .catch((err) => {
          console.error('[Cast] loadMedia failed:', err);
          showCastUnsupportedToast('Failed to start cast. The stream may still be loading \u2014 try again shortly.');
          if (videoEl) videoEl.play().catch(() => {}); // Restore local playback
        });
    }

    const isMobile = window.innerWidth <= 767;
    if (isMobile) {
      return renderMobileLayout({
        data,
        type,
        id,
        isTV,
        container,
        imdbId,
        title,
        year,
        rating,
        genres,
        runtime,
        similar,
        poster_path,
        hashQuery,
        urlParams,
        currentSeason,
        currentEpisode
      });
    }

    // Save initial progress (Movies only â€” TV shows will save after metadata loads)
    if (!isTV) {
      saveProgress({ 
        id: activeId, 
        title, 
        type: 'movie', 
        poster_path, 
        season: currentSeason, 
        episode: currentEpisode,
        logo_path: activeLogoUrl
      });
    }

    // Build seasons sidebar for TV
    let seasonsSidebarHTML = '';
    totalEpisodes = 0;
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
          <div class="player-episodes-pagination" id="player-episodes-pagination"></div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="player-ambient-bg" id="player-ambient-bg"></div>
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
            <!-- Smart Source Selector â€” populated & updated by SourceValidator -->
            <div class="sv-source-wrapper" id="sv-source-wrapper" style="display: ${currentPlayerMode === 'custom' ? 'none' : 'flex'}; margin-left: 8px; position: relative;">
              <button class="sv-source-trigger" id="sv-source-trigger" title="Select Streaming Server">
                <span class="sv-trigger-dot sv-dot-checking" id="sv-trigger-dot"></span>
                <span id="sv-trigger-label">Checking serversâ€¦</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="sv-trigger-arrow"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
              <div class="sv-dropdown" id="sv-dropdown" aria-hidden="true">
                <div class="sv-dropdown-header">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 0 0 4.93 19.07"/><path d="M4.93 4.93A10 10 0 0 0 19.07 19.07"/></svg>
                  <span>Streaming Servers</span>
                  <span class="sv-checking-pill" id="sv-checking-pill" style="display:none">
                    <span class="sv-spin"></span> Checkingâ€¦
                  </span>
                </div>
                <ul class="sv-list" id="sv-list" role="listbox">
                  ${SOURCES.map((s, i) => `
                    <li class="sv-item sv-item-checking" data-idx="${i}" data-id="${s.id}" role="option" aria-selected="${i === currentSourceIndex}" tabindex="0">
                      <span class="sv-item-dot"></span>
                      <div class="sv-item-info">
                        <span class="sv-item-name">${s.name}</span>
                        <span class="sv-item-status">Checkingâ€¦</span>
                      </div>
                      <span class="sv-item-badges" id="sv-badges-${s.id}"></span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="player-body ${isTV ? 'has-episodes' : ''}">
          <div class="player-main">
            <div class="player-video-wrapper mobile-player-container" id="video-wrapper">
              <button class="player-fs-btn" id="player-fs-btn" title="Fullscreen (F)">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fs-expand"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fs-shrink" style="display:none"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              </button>
            </div>

            <div class="player-info">
              ${logoUrl ? `
                <div class="player-logo-container">
                  <img class="player-logo-img" src="${logoUrl}" alt="${title}" />
                </div>
              ` : `
                <h1 class="player-title">${title}</h1>
              `}
              
              <div class="badge-premium-container">
                <span class="badge-premium badge-accent">â­ IMDB ${rating}</span>
                <span class="badge-premium badge-gold">${isTV ? 'TV Series' : 'Movie'}</span>
                ${year ? `<span class="badge-premium">${year}</span>` : ''}
                ${runtime ? `<span class="badge-premium">${runtime}</span>` : ''}
                <span class="badge-premium badge-accent">1080p FHD</span>
                <span class="badge-premium">Dolby 5.1</span>
                <span class="badge-premium badge-gold">Vision</span>
              </div>

              <div class="player-ep-details-container" style="margin-top: 12px; display: ${isTV ? 'block' : 'none'};">
                <h3 class="player-ep-title" style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 6px;"></h3>
                <p class="player-ep-overview" style="color: var(--text-dim); line-height: 1.5; font-size: 0.95rem;"></p>
              </div>
              ${data.overview ? `<p class="player-overview" style="margin-top: 12px; display: ${isTV ? 'none' : 'block'};">${data.overview}</p>` : ''}
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

    // Set initial ambient background glow (Movie: backdrop path, TV: will update to active episode's still during loadPlayerEpisodes)
    const ambientBg = container.querySelector('#player-ambient-bg');
    if (ambientBg && data.backdrop_path) {
      ambientBg.style.backgroundImage = `url(${img.backdrop(data.backdrop_path)})`;
    }

    // ---- Load the embed ----
    const cleanTitle = title.replace(/\[.*?\]/g, '').trim();

    // Helper to update episode-related details (title, overview, meta) dynamically in DOM
    function updateEpisodeInfoDOM(season, episode) {
      if (!isTV) return;
      
      // Update document/tab title
      document.title = `Watching ${title} - S${season} E${episode} | PlayerIQ`;

      // 1. Update the metadata span
      const metaEpEl = container.querySelector('.player-meta-episode');
      if (metaEpEl) {
        metaEpEl.textContent = `S${season} E${episode}`;
      }

      // 2. Fetch the active episode details
      const details = episodeDetails.get(`S${season}E${episode}`);
      const epTitleEl = container.querySelector('.player-ep-title');
      const epOverviewEl = container.querySelector('.player-ep-overview');
      const seriesOverviewEl = container.querySelector('.player-overview');

      if (details) {
        if (epTitleEl) {
          epTitleEl.textContent = details.name ? `Episode ${episode}: ${details.name}` : `Episode ${episode}`;
          epTitleEl.style.display = 'block';
        }
        if (epOverviewEl) {
          if (details.overview) {
            epOverviewEl.textContent = details.overview;
            epOverviewEl.style.display = 'block';
            if (seriesOverviewEl) seriesOverviewEl.style.display = 'none';
          } else {
            // Fallback to series overview
            epOverviewEl.style.display = 'none';
            if (seriesOverviewEl) {
              seriesOverviewEl.style.display = 'block';
              seriesOverviewEl.style.marginTop = '12px';
            }
          }
        }
      } else {
        // Fallback
        if (epTitleEl) epTitleEl.style.display = 'none';
        if (epOverviewEl) epOverviewEl.style.display = 'none';
        if (seriesOverviewEl) {
          seriesOverviewEl.style.display = 'block';
          seriesOverviewEl.style.marginTop = '12px';
        }
      }

      // 3. Update ambient background glow
      const ambientBg = container.querySelector('#player-ambient-bg');
      if (ambientBg) {
        let activeStill = data.backdrop_path;
        if (details && details.still_path) {
          activeStill = details.still_path;
        }
        if (activeStill) {
          ambientBg.style.backgroundImage = `url(${img.backdrop(activeStill)})`;
        }
      }
    }

    // For TV: load episode list FIRST so episodeRuntimes is populated
    // before loadPlayer runs, giving the player the correct episode duration.
    if (isTV) {
      const loadedEpCount = await loadPlayerEpisodes(activeId, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);
      if (loadedEpCount > 0) totalEpisodes = loadedEpCount;

      // Update DOM with initially loaded episode details
      updateEpisodeInfoDOM(currentSeason, currentEpisode);

      // Save initial TV progress with high-res episode screenshot and description
      let epStill = data.backdrop_path || data.poster_path;
      let epTitle = '';
      let epOverview = '';
      const details = episodeDetails.get(`S${currentSeason}E${currentEpisode}`);
      if (details) {
        if (details.still_path) {
          epStill = img.still(details.still_path);
        }
        epTitle = details.name;
        epOverview = details.overview;
      }
      saveProgress({
        id: activeId,
        title,
        type: 'tv',
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        season: currentSeason,
        episode: currentEpisode,
        episode_title: epTitle,
        episode_still: epStill,
        episode_overview: epOverview,
        logo_path: activeLogoUrl
      });

      loadPlayer(activeId, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
    } else {
      loadPlayer(activeId, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
    }

    // ---- Helper functions for episode navigation ----
    async function goToEpisode(season, episode) {
      currentSeason = season;
      currentEpisode = episode;

      // Load episodes first to ensure metadata is refreshed/cached
      const loadedEpCount = await loadPlayerEpisodes(activeId, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);
      if (loadedEpCount > 0) totalEpisodes = loadedEpCount;

      // Update DOM episode information dynamically
      updateEpisodeInfoDOM(currentSeason, currentEpisode);

      // Silently update browser address bar hash to preserve share/refresh state
      const newHash = `#/watch/tv/${id}?s=${currentSeason}&e=${currentEpisode}`;
      window.history.replaceState(null, '', newHash);

      let epStill = data.backdrop_path || data.poster_path;
      let epTitle = '';
      let epOverview = '';
      const details = episodeDetails.get(`S${currentSeason}E${currentEpisode}`);
      if (details) {
        if (details.still_path) {
          epStill = img.still(details.still_path);
        }
        epTitle = details.name;
        epOverview = details.overview;
      }

      // Save TV progress with high-res episode screenshot and description
      saveProgress({
        id: activeId,
        title,
        type: 'tv',
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        season: currentSeason,
        episode: currentEpisode,
        episode_title: epTitle,
        episode_still: epStill,
        episode_overview: epOverview,
        logo_path: activeLogoUrl
      });

      loadPlayer(activeId, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
      updateNowPlaying(currentSeason, currentEpisode);
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

    // ---- Auto-Play Countdown & Recommendations Overlay ----
    function handlePlaybackEnded() {
      // Remove any existing countdown or recommendations first to prevent duplicate overlays
      wrapper.querySelectorAll('.vp-countdown-overlay, .vp-recommendations-overlay').forEach(el => el.remove());

      const nextEpNum = currentEpisode + 1;
      // If TV show and has next episode, show countdown
      if (isTV && nextEpNum <= totalEpisodes) {
        showAutoPlayCountdown(nextEpNum);
      } else {
        // If movie or last episode, show recommendations overlay
        showRecommendationsOverlay();
      }
    }

    function showAutoPlayCountdown(nextEpNum) {
      let count = 5;
      const overlay = document.createElement('div');
      overlay.className = 'vp-countdown-overlay';
      overlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 150;
        color: #fff;
        font-family: var(--font-display);
        animation: fadeIn 0.4s ease;
      `;

      overlay.innerHTML = `
        <div style="font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--text-secondary); margin-bottom: var(--space-xs);">Up Next</div>
        <div style="font-size: var(--text-2xl); font-weight: var(--weight-bold); margin-bottom: var(--space-lg); text-align: center; max-width: 80%; text-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          S${currentSeason} E${nextEpNum}
        </div>
        
        <!-- Circular Progress Ring & Number -->
        <div style="position: relative; width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-xl);">
          <svg width="120" height="120" style="transform: rotate(-90deg);">
            <circle cx="60" cy="60" r="50" fill="transparent" stroke="rgba(255,255,255,0.1)" stroke-width="8"></circle>
            <circle class="countdown-circle" cx="60" cy="60" r="50" fill="transparent" stroke="var(--accent)" stroke-width="8" stroke-dasharray="314.16" stroke-dashoffset="0" style="transition: stroke-dashoffset 1s linear;"></circle>
          </svg>
          <span class="countdown-seconds" style="position: absolute; font-size: var(--text-3xl); font-weight: var(--weight-bold); text-shadow: 0 2px 10px rgba(229,9,20,0.5);">5</span>
        </div>
        
        <div style="display: flex; gap: var(--space-md);">
          <button class="countdown-cancel-btn" style="
            padding: 10px 24px;
            border-radius: var(--radius-sm);
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.12);
            color: var(--text-primary);
            font-weight: var(--weight-semibold);
            font-size: var(--text-sm);
            cursor: pointer;
            transition: all 0.3s;
          ">Cancel</button>
          <button class="countdown-play-btn" style="
            padding: 10px 24px;
            border-radius: var(--radius-sm);
            background: var(--accent);
            border: none;
            color: white;
            font-weight: var(--weight-semibold);
            font-size: var(--text-sm);
            cursor: pointer;
            box-shadow: var(--shadow-glow-sm);
            transition: all 0.3s;
          ">Play Now</button>
        </div>
      `;

      wrapper.appendChild(overlay);

      const circle = overlay.querySelector('.countdown-circle');
      const text = overlay.querySelector('.countdown-seconds');

      const interval = setInterval(() => {
        count--;
        if (text) text.textContent = count;
        if (circle) {
          const dashoffset = 314.16 * ((5 - count) / 5);
          circle.style.strokeDashoffset = dashoffset;
        }

        if (count <= 0) {
          clearInterval(interval);
          overlay.remove();
          nextEpisode();
        }
      }, 1000);

      // Cancel button
      overlay.querySelector('.countdown-cancel-btn').addEventListener('click', () => {
        clearInterval(interval);
        overlay.remove();
        showRecommendationsOverlay();
      });

      // Play Now button
      overlay.querySelector('.countdown-play-btn').addEventListener('click', () => {
        clearInterval(interval);
        overlay.remove();
        nextEpisode();
      });
    }

    function showRecommendationsOverlay() {
      // Remove any existing overlay
      wrapper.querySelectorAll('.vp-recommendations-overlay').forEach(el => el.remove());

      if (!similar.length) return;

      const overlay = document.createElement('div');
      overlay.className = 'vp-recommendations-overlay';
      overlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: rgba(10,10,15,0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 140;
        color: #fff;
        font-family: var(--font-display);
        animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        padding: var(--space-lg);
      `;

      const recCards = similar.slice(0, 3).map(item => {
        const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : 'data:image/svg+xml,...';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'â€”';
        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        const cardRoute = `/${type}/${item.id}`;
        
        return `
          <div class="rec-card" data-route="${cardRoute}" style="
            width: 140px;
            cursor: pointer;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
            gap: var(--space-2xs);
          ">
            <div style="
              position: relative;
              width: 100%;
              height: 200px;
              border-radius: var(--radius-sm);
              overflow: hidden;
              border: 1px solid rgba(255,255,255,0.08);
              box-shadow: var(--shadow-card);
            ">
              <img src="${posterUrl}" alt="${item.title || item.name}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s;" class="rec-poster" />
              <div style="
                position: absolute;
                top: 8px;
                right: 8px;
                background: rgba(10,10,15,0.85);
                backdrop-filter: blur(4px);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: var(--weight-bold);
                color: var(--rating-high);
                border: 1px solid rgba(255,255,255,0.06);
              ">â­ ${rating}</div>
            </div>
            <div style="
              font-size: var(--text-sm);
              font-weight: var(--weight-bold);
              color: var(--text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-top: 4px;
            ">${item.title || item.name}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${year}</div>
          </div>
        `;
      }).join('');

      overlay.innerHTML = `
        <!-- Replay Button -->
        <button class="rec-replay-btn" style="
          position: absolute;
          top: var(--space-lg);
          right: var(--space-lg);
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: var(--text-xs);
          font-weight: var(--weight-bold);
          cursor: pointer;
          transition: all 0.3s;
        ">
          <i data-lucide="rotate-ccw" style="width:14px;height:14px;"></i> Replay Video
        </button>

        <div style="font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--accent); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: var(--space-xs);">Finished Playing</div>
        <div style="font-size: var(--text-xl); font-weight: var(--weight-extrabold); margin-bottom: var(--space-xl);">More Like This</div>
        
        <div class="rec-cards-container" style="
          display: flex;
          gap: var(--space-lg);
          justify-content: center;
          width: 100%;
          margin-bottom: var(--space-lg);
        ">
          ${recCards}
        </div>
      `;

      wrapper.appendChild(overlay);
      if (window.lucide) window.lucide.createIcons();

      // Card hover effects & click routing
      overlay.querySelectorAll('.rec-card').forEach(card => {
        const poster = card.querySelector('.rec-poster');
        card.addEventListener('mouseenter', () => {
          if (poster) poster.style.transform = 'scale(1.05)';
        });
        card.addEventListener('mouseleave', () => {
          if (poster) poster.style.transform = 'none';
        });
        card.addEventListener('click', () => {
          overlay.remove();
          window.location.hash = card.dataset.route;
        });
      });

      // Replay button
      overlay.querySelector('.rec-replay-btn').addEventListener('click', () => {
        overlay.remove();
        loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
      });
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

    // Smart Source Selector â€” dropdown toggle + item selection
    (() => {
      const wrapper = document.getElementById('sv-source-wrapper');
      const trigger = document.getElementById('sv-source-trigger');
      const dropdown = document.getElementById('sv-dropdown');
      if (!trigger || !dropdown) return;

      function openDropdown() {
        dropdown.classList.add('sv-dropdown-open');
        dropdown.setAttribute('aria-hidden', 'false');
        trigger.classList.add('sv-trigger-open');
      }
      function closeDropdown() {
        dropdown.classList.remove('sv-dropdown-open');
        dropdown.setAttribute('aria-hidden', 'true');
        trigger.classList.remove('sv-trigger-open');
      }

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.contains('sv-dropdown-open') ? closeDropdown() : openDropdown();
      });

      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (!wrapper?.contains(e.target)) closeDropdown();
      });

      // Source item click â€” select source & reload iframe
      dropdown.querySelectorAll('.sv-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.idx);
          if (isNaN(idx)) return;

          // Skip if unavailable (show tooltip instead)
          if (item.classList.contains('sv-item-unavailable')) {
            item.classList.add('sv-item-shake');
            setTimeout(() => item.classList.remove('sv-item-shake'), 500);
            return;
          }

          currentSourceIndex = idx;
          localStorage.setItem('piq_source', currentSourceIndex);

          // Update active state visually
          dropdown.querySelectorAll('.sv-item').forEach(el => el.setAttribute('aria-selected', 'false'));
          item.setAttribute('aria-selected', 'true');

          // Update trigger label to selected source name
          const triggerLabel = document.getElementById('sv-trigger-label');
          if (triggerLabel) triggerLabel.textContent = item.querySelector('.sv-item-name')?.textContent || '';

          closeDropdown();
          loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
        });

        // Keyboard: Enter/Space to select
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
        });
      });
    })();

    // Mode selector
    document.getElementById('mode-select')?.addEventListener('change', (e) => {
      currentPlayerMode = e.target.value;
      localStorage.setItem('piq_player_mode', currentPlayerMode);

      const svWrapper = document.getElementById('sv-source-wrapper');
      if (svWrapper) {
        svWrapper.style.display = currentPlayerMode === 'custom' ? 'none' : 'flex';
      }

      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
    });

    // TV season/episode handling
    if (isTV && data.seasons?.length) {
      await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);

      document.getElementById('player-season-select')?.addEventListener('change', async (e) => {
        currentSeason = parseInt(e.target.value);
        currentEpisode = 1;
        // Update total episodes from the actual loaded season
        totalEpisodes = await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);
        loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
        updateNowPlaying(currentSeason, currentEpisode);
      });
    }

    attachCardClicks(container);
    if (window.lucide) window.lucide.createIcons();

    // Cleanup function
    return () => {
      try {
        disableRedirectGuard();
        clearIframeTracker();
        if (_keyHandler) {
          window.removeEventListener('keydown', _keyHandler);
          _keyHandler = null;
        }
        if (activePlayer) {
          activePlayer.destroy();
          activePlayer = null;
        }
      } catch (err) {
        console.error('Error during desktop player page cleanup:', err);
      }
    };

  } catch (err) {
    console.error('Player page error:', err);
    if (err.message === 'OFFLINE_AND_NOT_DOWNLOADED' || !navigator.onLine || isOfflinePlayback) {
      container.innerHTML = `
        <div class="player-offline-error-overlay" style="margin-top: 60px;">
          <div class="player-offline-error-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.5"></path><path d="M5 12.5a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
          </div>
          <h3 class="player-offline-error-title">Episode Not Downloaded</h3>
          <p class="player-offline-error-message">
            This episode hasn't been downloaded for offline viewing. Please connect to the internet or watch downloaded episodes from your settings library.
          </p>
          <button class="player-offline-error-btn" onclick="window.location.hash = '#/settings'">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Go to My Downloads</span>
          </button>
        </div>
      `;
    } else {
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
    }
    if (window.lucide) window.lucide.createIcons();
  }
}

// ---- Helpers ----
function updateNowPlaying(season, episode) {
  const epEl = document.querySelector('.player-now-ep');
  if (epEl) epEl.textContent = `S${season} E${episode}`;
}

async function loadPlayerEpisodes(tvId, seasonNumber, activeEpisode = 1, title = '', posterPath = null, backdropPath = null, cleanTitle = null, year = null, onEnded = null, onEpisodeClick = null) {
  const listEl = document.getElementById('player-episodes-list');
  if (!listEl) return;
  listEl.innerHTML = `
    <div class="player-loading-overlay" style="position:relative;min-height:200px;">
      <div class="player-loading-spinner"></div>
    </div>
  `;

  try {
    let episodes = [];
    if (!navigator.onLine || isOfflinePlayback) {
      const list = await DownloadManager.list();
      const prefix = `tv_${tvId}_s${seasonNumber}_e`;
      const tvDownloads = list.filter(item => item.id.startsWith(prefix) && item.status === 'COMPLETED');
      
      episodes = tvDownloads.map(item => {
        const match = item.id.match(/_e(\d+)$/);
        const epNum = match ? parseInt(match[1]) : 1;
        return {
          episode_number: epNum,
          name: item.title.split(': ')[1] || `Episode ${epNum}`,
          runtime: 45,
          still_path: item.posterPath || null,
          overview: 'Offline playback from IndexedDB.'
        };
      }).sort((a, b) => a.episode_number - b.episode_number);
    } else {
      const season = await getSeasonDetails(tvId, seasonNumber, cleanTitle, year);
      episodes = season.episodes || [];
    }

    if (episodes.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">No downloaded episodes found for this season.</p>';
      return 0;
    }

    // Store per-episode runtimes and details
    episodes.forEach(ep => {
      if (ep.runtime) {
        episodeRuntimes.set(`S${seasonNumber}E${ep.episode_number}`, ep.runtime * 60);
      }
      episodeDetails.set(`S${seasonNumber}E${ep.episode_number}`, {
        still_path: ep.still_path || null,
        name: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || ''
      });
    });

    await cacheSeasonEpisodesWithProgress(tvId, seasonNumber, episodes);

    // Set tmdbRuntimeSeconds to the active episode's runtime right away
    const activeEpRuntime = episodeRuntimes.get(`S${seasonNumber}E${activeEpisode}`);
    if (activeEpRuntime) tmdbRuntimeSeconds = activeEpRuntime;

    const totalPages = Math.ceil(currentSeasonEpisodes.length / EPISODES_PER_PAGE);

    function renderPage(page) {
      currentEpisodesPage = Math.max(1, Math.min(totalPages, page));
      
      const startIndex = (currentEpisodesPage - 1) * EPISODES_PER_PAGE;
      const pageEpisodes = currentSeasonEpisodes.slice(startIndex, startIndex + EPISODES_PER_PAGE);
      
      // Map and render episode cards
      listEl.innerHTML = pageEpisodes.map(ep => {
        const epNum = ep.episode_number;
        const isCurrent = epNum === activeEpisode;
        
        let progressHTML = '';
        if (ep.progress && ep.progress > 0) {
          progressHTML = `
            <div class="card-progress-bar-container">
              <div class="card-progress-bar-fill" style="width: ${Math.min(100, ep.progress)}%;"></div>
            </div>
          `;
        }
        
        const thumbUrl = ep.still_path 
          ? img.still(ep.still_path) 
          : (backdropPath ? img.backdrop(backdropPath) : (posterPath ? img.poster(posterPath) : ''));
          
        return `
          <div class="player-episode-card ${isCurrent ? 'active' : ''} slide-in-transition" 
               data-episode="${epNum}" data-season="${seasonNumber}">
            <div class="player-episode-thumb-wrapper">
              ${thumbUrl ? `<img class="player-episode-thumb" src="${thumbUrl}" alt="${ep.name || `Episode ${epNum}`}" loading="lazy" />` : ''}
              <div class="player-episode-overlay">
                <div class="player-episode-play-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 19 12 5 20 5 4"></polygon></svg>
                </div>
              </div>
              <span class="player-episode-number-badge">E${epNum}</span>
              ${ep.runtime ? `<span class="player-episode-duration-badge">${ep.runtime} min</span>` : ''}
              ${progressHTML}
            </div>
            <div class="player-episode-details">
              <div class="player-episode-title-name">${ep.name || `Episode ${epNum}`}</div>
              <div class="player-episode-synopsis">${ep.overview || 'No description available for this episode.'}</div>
            </div>
            ${isCurrent ? `
              <div class="player-episode-glow-ring"></div>
              <div class="player-episode-active-status">Playing</div>
            ` : ''}
          </div>
        `;
      }).join('');
      
      // Render Pagination Panel Footer Controls
      const paginationEl = document.getElementById('player-episodes-pagination');
      if (paginationEl) {
        if (totalPages <= 1) {
          paginationEl.style.display = 'none';
        } else {
          paginationEl.style.display = 'flex';
          paginationEl.innerHTML = `
            <button class="pag-btn prev-btn" ${currentEpisodesPage === 1 ? 'disabled' : ''} aria-label="Previous Page">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span class="pag-info">Page ${currentEpisodesPage} of ${totalPages}</span>
            <button class="pag-btn next-btn" ${currentEpisodesPage === totalPages ? 'disabled' : ''} aria-label="Next Page">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          `;
          
          paginationEl.querySelector('.prev-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            renderPage(currentEpisodesPage - 1);
          });
          
          paginationEl.querySelector('.next-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            renderPage(currentEpisodesPage + 1);
          });
        }
      }
      
      // Bind click triggers for cards
      listEl.querySelectorAll('.player-episode-card').forEach(card => {
        card.addEventListener('click', () => {
          const epNum = parseInt(card.dataset.episode);
          const sNum = parseInt(card.dataset.season);
          
          if (onEpisodeClick) {
            onEpisodeClick(sNum, epNum);
          } else {
            const epRuntime = episodeRuntimes.get(`S${sNum}E${epNum}`);
            if (epRuntime) tmdbRuntimeSeconds = epRuntime;
            
            loadPlayer(tvId, true, sNum, epNum, title, null, posterPath, backdropPath, onEnded);
            
            listEl.querySelectorAll('.player-episode-card').forEach(el => {
              el.classList.remove('active');
              el.querySelector('.player-episode-glow-ring')?.remove();
              el.querySelector('.player-episode-active-status')?.remove();
            });
            card.classList.add('active');
            card.insertAdjacentHTML('beforeend', `
              <div class="player-episode-glow-ring"></div>
              <div class="player-episode-active-status">Playing</div>
            `);
            
            updateNowPlaying(sNum, epNum);
          }
        });
      });

      // Smooth scroll playing card into viewport
      const activeEl = listEl.querySelector('.player-episode-card.active');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // Auto-focus currentEpisodesPage based on activeEpisode position
    const activePage = Math.ceil(activeEpisode / EPISODES_PER_PAGE);
    renderPage(activePage);

    return episodes.length;

  } catch (err) {
    console.error('[loadPlayerEpisodes] error:', err);
    listEl.innerHTML = '<p style="color:var(--text-muted);padding:var(--space-md)">Failed to load episodes.</p>';
    return 0;
  }
}

// ====================================================
// ðŸ“± PORTRAIT-FIRST MOBILE REDESIGN IMPLEMENTATION
// ====================================================

function pushTelemetry(event, data) {
  if (!window.playeriqTelemetry) {
    window.playeriqTelemetry = [];
  }
  window.playeriqTelemetry.push({
    event,
    timestamp: Date.now(),
    ...data
  });
  console.log(`[Telemetry] ${event}:`, data);
}

function setupSwipeGestures(element, onSwipeLeft, onSwipeRight) {
  let touchStartX = 0;
  let touchStartY = 0;

  element.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  element.addEventListener('touchend', (e) => {
    const diffX = e.changedTouches[0].screenX - touchStartX;
    const diffY = e.changedTouches[0].screenY - touchStartY;

    if (Math.abs(diffX) > 80 && Math.abs(diffY) < 40) {
      if (diffX < 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    }
  }, { passive: true });
}

function setupOrientationMonitor() {
  let toastEl = null;

  function checkOrientation() {
    const isMobile = window.innerWidth <= 767;
    if (!isMobile) {
      removeToast();
      return;
    }

    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape) {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'rotate-toast';
        toastEl.innerHTML = `
          <span>Rotate to watch in cinematic landscape</span>
          <button class="rotate-toast-btn" id="go-fullscreen-btn" aria-label="Go Fullscreen">Go Fullscreen</button>
        `;
        document.body.appendChild(toastEl);

        toastEl.querySelector('#go-fullscreen-btn').addEventListener('click', () => {
          pushTelemetry('entered_fullscreen', { method: 'rotate' });
          toggleFullscreen();
          removeToast();
        });
      }
    } else {
      removeToast();
    }
  }

  function removeToast() {
    if (toastEl) {
      toastEl.remove();
      toastEl = null;
    }
  }

  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

  return () => {
    window.removeEventListener('resize', checkOrientation);
    window.removeEventListener('orientationchange', checkOrientation);
    removeToast();
  };
}

function setupMiniPlayer(videoElement, activePlayerInstance, id, type, season, episode, title, posterPath, backdropPath) {
  const existing = document.getElementById('global-mini-player');
  if (existing) existing.remove();

  const miniPlayer = document.createElement('div');
  miniPlayer.id = 'global-mini-player';
  miniPlayer.className = 'mini-player';
  
  const subText = type === 'tv' ? `Season ${season} Â· Episode ${episode}` : 'Movie';
  
  miniPlayer.innerHTML = `
    <div class="mini-player-thumb-container" id="mini-player-thumb"></div>
    <div class="mini-player-details">
      <h4 class="mini-player-title">${title}</h4>
      <p class="mini-player-sub">${subText}</p>
    </div>
    <div class="mini-player-controls">
      <button class="mini-player-btn" id="mini-player-toggle" aria-label="Toggle Play">
        <svg class="mini-icon-pause" viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        <svg class="mini-icon-play" viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;display:none;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>
      <button class="mini-player-btn" id="mini-player-close" aria-label="Close Player">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="mini-player-progress-bar">
      <div class="mini-player-progress" id="mini-player-progress-bar-fill" style="width: 0%;"></div>
    </div>
  `;

  document.body.appendChild(miniPlayer);

  const thumbContainer = miniPlayer.querySelector('#mini-player-thumb');
  if (thumbContainer && videoElement) {
    thumbContainer.appendChild(videoElement);
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'cover';
  }

  window.activeVideoElement = videoElement;
  window.activeMediaId = id;
  window.activeMediaType = type;
  window.activeMediaSeason = season;
  window.activeMediaEpisode = episode;
  window.activeMediaTitle = title;
  window.activeMediaPoster = posterPath;
  window.activeMediaBackdrop = backdropPath;

  const fill = miniPlayer.querySelector('#mini-player-progress-bar-fill');
  const toggleBtn = miniPlayer.querySelector('#mini-player-toggle');
  const iconPause = toggleBtn.querySelector('.mini-icon-pause');
  const iconPlay = toggleBtn.querySelector('.mini-icon-play');

  function updateMiniProgress() {
    const cur = videoElement.currentTime;
    const dur = videoElement.duration || 1;
    if (fill && dur > 0) {
      fill.style.width = `${(cur / dur) * 100}%`;
    }
  }
  
  videoElement.addEventListener('timeupdate', updateMiniProgress);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (videoElement.paused) {
      videoElement.play();
      iconPause.style.display = 'block';
      iconPlay.style.display = 'none';
    } else {
      videoElement.pause();
      iconPause.style.display = 'none';
      iconPlay.style.display = 'block';
    }
  });

  videoElement.addEventListener('play', () => {
    iconPause.style.display = 'block';
    iconPlay.style.display = 'none';
  });
  
  videoElement.addEventListener('pause', () => {
    iconPause.style.display = 'none';
    iconPlay.style.display = 'block';
  });

  const closeBtn = miniPlayer.querySelector('#mini-player-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    videoElement.removeEventListener('timeupdate', updateMiniProgress);
    if (videoElement._hls) {
      videoElement._hls.destroy();
    }
    videoElement.pause();
    videoElement.src = '';
    videoElement.load();
    miniPlayer.remove();
    
    window.activeVideoElement = null;
    window.activeMediaId = null;
    window.activeMediaType = null;
    window.activeMediaSeason = null;
    window.activeMediaEpisode = null;
  });

  miniPlayer.addEventListener('click', () => {
    window.location.hash = `/watch/${type}/${id}?s=${season}&e=${episode}`;
  });

  pushTelemetry('mini_player_opened', { id, type, season, episode });
}

// ====================================================================
// CAST â€” Google Cast Application Framework (CAF) v3 SDK Integration
// ====================================================================

// Module-level references set when a cast session starts
let _castRemotePlayer = null; // cast.framework.RemotePlayer
let _castController   = null; // cast.framework.RemotePlayerController
let _castOnSessionEnd = null; // Callback set by renderPlayerPage closure

/**
 * Injects the Google Cast Sender SDK and initializes CastContext with the
 * Default Media Receiver. __onGCastApiAvailable MUST be registered before
 * the <script> tag is appended â€” that is the SDK's required entry point.
 *
 * Works in Chrome desktop and Android Chrome.
 * Discovers ALL Cast-enabled devices on the local network:
 *   Chromecast, Android TV, Google TV, Chromecast built-in Smart TVs.
 */
function loadGoogleCastSDK() {
  if (window.__piqCastSdkLoaded) return;
  window.__piqCastSdkLoaded = true;

  // Must be registered BEFORE the <script> tag is appended
  window['__onGCastApiAvailable'] = (isAvailable) => {
    if (!isAvailable) return;
    try {
      const ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, // 'CC1AD845'
        autoJoinPolicy:        chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        resumeSavedSession:    false,
      });

      // Session ended or failed (from TV side or connection drop) â†’ clean up
      ctx.addEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (event) => {
          const { SESSION_ENDED, SESSION_START_FAILED } = cast.framework.SessionState;
          if (event.sessionState === SESSION_ENDED || event.sessionState === SESSION_START_FAILED) {
            if (typeof _castOnSessionEnd === 'function') {
              try { _castOnSessionEnd(); } catch (e) {}
            }
            stopCastingFlow(true /* fromSdkEvent â€” don't call endCurrentSession again */);
          }
        }
      );

      // Sync cast button glow state & visibility with SDK connection state
      const updateCastButtons = (state) => {
        const isCasting = state === cast.framework.CastState.CONNECTED;
        const hasDevices = state !== cast.framework.CastState.NO_DEVICES_AVAILABLE;

        document.querySelectorAll('#action-cast, #vp-cast-btn, #vp-top-cast-btn')
          .forEach(el => {
            if (el) {
              el.classList.toggle('casting-active', isCasting);
              
              // Bottom cast button is only for mobile (< 768px). Desktop uses the top bar cast button.
              if (el.id === 'vp-cast-btn') {
                if (window.innerWidth <= 767) {
                  el.style.display = hasDevices ? 'inline-block' : 'none';
                } else {
                  el.style.display = 'none';
                }
              } else {
                el.style.display = hasDevices ? 'inline-block' : 'none';
              }
            }
          });
      };

      ctx.addEventListener(
        cast.framework.CastContextEventType.CAST_STATE_CHANGED,
        (event) => {
          updateCastButtons(event.castState);
        }
      );

      // Perform initial check immediately
      setTimeout(() => updateCastButtons(ctx.getCastState()), 100);

      console.log('[Cast SDK] Initialized â€” Default Media Receiver (CC1AD845) â€” Android TV / Chromecast discovery enabled');
    } catch (err) {
      console.warn('[Cast SDK] Initialization failed:', err.message);
    }
  };

  const script = document.createElement('script');
  script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  script.onerror = () => { window.__piqCastSdkLoaded = false; }; // Allow retry on error
  document.head.appendChild(script);
}

/**
 * Stop the casting flow and clean up all associated state and UI.
 * @param {boolean} fromSdkEvent  Pass true when called from a SESSION_ENDED event
 *   so we don't call endCurrentSession() a second time (would throw).
 */
function stopCastingFlow(fromSdkEvent = false) {
  // Tell the SDK to end the session when WE initiate the disconnect
  if (!fromSdkEvent && window.cast && cast.framework) {
    try { cast.framework.CastContext.getInstance().endCurrentSession(true); } catch (e) {}
  }
  // Remove sticky cast bar
  const bar = document.getElementById('global-cast-session-bar');
  if (bar) bar.remove();
  // Nullify live references
  _castRemotePlayer = null;
  _castController   = null;
  _castOnSessionEnd = null;
  localStorage.removeItem('piq_cast_session_id');
}

/**
 * Mount the sticky cast session bar at the bottom of the page.
 * Controls are wired to the real RemotePlayerController â€” no polling needed.
 *
 * @param {string}      deviceName  Friendly name from SDK (e.g. "Living Room TV")
 * @param {string}      title       Content title
 * @param {string|null} imagePath   TMDB backdrop_path or poster_path
 */
function mountGlobalCastBar(deviceName, title, imagePath) {
  const existing = document.getElementById('global-cast-session-bar');
  if (existing) existing.remove();

  const thumbSrc = imagePath ? img.backdrop(imagePath) : '';
  const bar = document.createElement('div');
  bar.className = 'cast-session-bar';
  bar.id = 'global-cast-session-bar';
  bar.innerHTML = `
    <div class="cast-session-details">
      ${thumbSrc ? `<img class="cast-session-thumb" src="${thumbSrc}" alt="Thumb" />` : ''}
      <div class="cast-session-info">
        <h4 class="cast-session-title">${title}</h4>
        <div class="cast-session-status" id="cast-bar-status">Casting to ${deviceName || 'TV'}\u2026</div>
      </div>
    </div>
    <div class="cast-session-controls">
      <button class="cast-session-btn" id="cast-bar-play-btn" aria-label="Toggle Play">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </button>
      <button class="cast-session-btn disconnect" id="cast-bar-disconnect-btn" aria-label="Stop Casting">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(bar);

  const playBtn       = bar.querySelector('#cast-bar-play-btn');
  const disconnectBtn = bar.querySelector('#cast-bar-disconnect-btn');
  const statusEl      = bar.querySelector('#cast-bar-status');

  // Play/pause wired to the real SDK RemotePlayerController
  if (playBtn && _castController) {
    playBtn.addEventListener('click', () => _castController.playOrPause());
  }

  // Disconnect wired to SDK endCurrentSession
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => stopCastingFlow(false));
  }

  // Sync play/pause icon with live TV state via RemotePlayerController events
  if (_castController && _castRemotePlayer) {
    _castController.addEventListener(
      cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
      () => {
        if (!_castRemotePlayer) return;
        const paused = _castRemotePlayer.isPaused;
        if (playBtn) {
          playBtn.innerHTML = paused
            ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        }
        if (statusEl) {
          statusEl.textContent = paused
            ? `Paused on ${deviceName || 'TV'}`
            : `Casting to ${deviceName || 'TV'}\u2026`;
        }
      }
    );
  }
}

/**
 * Show a non-blocking slide-up toast when casting is unavailable.
 * Auto-dismisses after 4 seconds. Safe to call from any context.
 */
function showCastUnsupportedToast(message) {
  const prev = document.querySelector('.cast-unsupported-toast');
  if (prev) prev.remove();

  const toast = document.createElement('div');
  toast.className = 'cast-unsupported-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  // Double rAF ensures the element is painted before the class triggers the CSS transition
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

async function loadMobileEpisodes(tvId, activeSeason, activeEpisode, title, data, goToEpisode) {
  const chipsContainer = document.getElementById('mobile-season-chips');
  const listContainer = document.getElementById('mobile-episodes-list');
  const showAllBtn = document.getElementById('mobile-show-all-btn');
  if (!listContainer || !chipsContainer) return;

  chipsContainer.innerHTML = `<div class="player-loading-overlay" style="position:relative;min-height:50px;"><div class="player-loading-spinner"></div></div>`;
  listContainer.innerHTML = `<div class="player-loading-overlay" style="position:relative;min-height:100px;"><div class="player-loading-spinner"></div></div>`;

  try {
    let validSeasons = [];
    let episodes = [];

    if (!navigator.onLine || isOfflinePlayback) {
      const list = await DownloadManager.list();
      const seasonSet = new Set();
      const prefix = `tv_${tvId}_s`;
      
      const tvDownloads = list.filter(item => item.id.startsWith(prefix) && item.status === 'COMPLETED');
      
      tvDownloads.forEach(item => {
        const match = item.id.match(/_s(\d+)_e/);
        if (match) {
          seasonSet.add(parseInt(match[1]));
        }
      });
      
      validSeasons = Array.from(seasonSet).sort((a, b) => a - b).map(sNum => ({
        season_number: sNum,
        name: `Season ${sNum}`
      }));
      
      const seasonPrefix = `tv_${tvId}_s${activeSeason}_e`;
      const activeDownloads = tvDownloads.filter(item => item.id.startsWith(seasonPrefix));
      
      episodes = activeDownloads.map(item => {
        const match = item.id.match(/_e(\d+)$/);
        const epNum = match ? parseInt(match[1]) : 1;
        return {
          episode_number: epNum,
          name: item.title.split(': ')[1] || `Episode ${epNum}`,
          runtime: 45,
          still_path: item.posterPath || null,
          overview: 'Offline playback from IndexedDB.'
        };
      }).sort((a, b) => a.episode_number - b.episode_number);
    } else {
      validSeasons = (data.seasons || []).filter(s => s.season_number > 0);
      const cleanTitle = title.replace(/\[.*?\]/g, '').trim();
      const year = (data.first_air_date || '').slice(0, 4);
      const seasonDetails = await getSeasonDetails(tvId, activeSeason, cleanTitle, year);
      episodes = seasonDetails.episodes || [];
    }

    if (validSeasons.length === 0 && episodes.length === 0) {
      chipsContainer.innerHTML = '';
      listContainer.innerHTML = `<p style="color:var(--text-muted);padding:20px;text-align:center;">No downloaded seasons found.</p>`;
      if (showAllBtn) showAllBtn.style.display = 'none';
      return 0;
    }

    chipsContainer.innerHTML = validSeasons.map(s => `
      <button class="season-tab ${s.season_number === activeSeason ? 'active' : ''}" 
              data-season="${s.season_number}" 
              role="tab" 
              aria-selected="${s.season_number === activeSeason ? 'true' : 'false'}">
        Season ${s.season_number}
      </button>
    `).join('');

    const history = await getWatchHistory().catch(() => []);

    listContainer.innerHTML = episodes.map((ep, idx) => {
      const epNum = ep.episode_number;
      const epTitle = ep.name || `Episode ${epNum}`;
      const epOverview = ep.overview || 'No description available.';
      const runtimeStr = ep.runtime ? `${ep.runtime}m` : '';
      const isCurrent = epNum === activeEpisode;
      
      let progressHTML = '';
      const match = history.find(item => 
        String(item.id) === String(tvId) && 
        item.type === 'tv' && 
        Number(item.season) === Number(activeSeason) && 
        Number(item.episode) === Number(epNum)
      );
      if (match && match.duration > 0 && match.currentTime > 0) {
        const pct = Math.min(100, Math.floor((match.currentTime / match.duration) * 100));
        if (pct < 98) {
          progressHTML = `
            <div class="episode-row-progress-container">
              <div class="episode-row-progress" style="width: ${pct}%;"></div>
            </div>
          `;
        }
      }

      const thumbUrl = ep.still_path 
        ? img.still(ep.still_path) 
        : (data.backdrop_path ? img.backdrop(data.backdrop_path) : 'data:image/svg+xml,...');

      const isHidden = idx >= 3;

      return `
        <div class="mobile-episode-row ${isCurrent ? 'active' : ''} ${isHidden ? 'collapsed-hidden' : ''}" 
             data-episode="${epNum}" 
             data-season="${activeSeason}">
          <div class="mobile-ep-thumb-wrapper">
            <img class="mobile-ep-thumb" src="${thumbUrl}" alt="${epTitle}" loading="lazy" />
            ${runtimeStr ? `<span class="mobile-ep-duration">${runtimeStr}</span>` : ''}
            ${progressHTML}
          </div>
          <div class="mobile-ep-details">
            <div class="mobile-ep-meta-title">
              <h4 class="mobile-ep-title">${epNum}. ${epTitle}</h4>
            </div>
            <p class="mobile-ep-description">${epOverview}</p>
            <div class="mobile-ep-actions">
              <button class="mobile-ep-action-btn play" aria-label="Play Episode">
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <button class="mobile-ep-action-btn download" aria-label="Download Episode">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (episodes.length > 3) {
      showAllBtn.style.display = 'flex';
      showAllBtn.classList.remove('expanded');
      showAllBtn.querySelector('span').textContent = `Show All (${episodes.length - 3} more)`;
      
      showAllBtn.onclick = () => {
        const hiddenRows = listContainer.querySelectorAll('.mobile-episode-row.collapsed-hidden');
        const allRows = listContainer.querySelectorAll('.mobile-episode-row');
        
        if (showAllBtn.classList.contains('expanded')) {
          allRows.forEach((row, idx) => {
            if (idx >= 3) row.classList.add('collapsed-hidden');
          });
          showAllBtn.classList.remove('expanded');
          showAllBtn.querySelector('span').textContent = `Show All (${episodes.length - 3} more)`;
          showAllBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          allRows.forEach(row => row.classList.remove('collapsed-hidden'));
          showAllBtn.classList.add('expanded');
          showAllBtn.querySelector('span').textContent = 'Show Less';
        }
      };
    } else {
      showAllBtn.style.display = 'none';
    }

    listContainer.querySelectorAll('.mobile-episode-row').forEach(row => {
      row.addEventListener('click', () => {
        const ep = parseInt(row.dataset.episode);
        if (window._checkAndTriggerRotation) {
          window._checkAndTriggerRotation(() => goToEpisode(activeSeason, ep));
        } else {
          goToEpisode(activeSeason, ep);
        }
      });
      row.querySelectorAll('.mobile-ep-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const ep = parseInt(row.dataset.episode);
          if (btn.classList.contains('play')) {
            if (window._checkAndTriggerRotation) {
              window._checkAndTriggerRotation(() => goToEpisode(activeSeason, ep));
            } else {
              goToEpisode(activeSeason, ep);
            }
          } else if (btn.classList.contains('download')) {
            pushTelemetry('download_requested', { id: tvId, type: 'tv', season: activeSeason, episode: ep });
            alert(`Download starting for Episode ${ep}...`);
          }
        });
      });
    });

    chipsContainer.querySelectorAll('.season-tab').forEach(chip => {
      chip.addEventListener('click', () => {
        const s = parseInt(chip.dataset.season);
        loadMobileEpisodes(tvId, s, 1, title, data, goToEpisode);
      });
    });

    episodes.forEach(ep => {
      if (ep.runtime) {
        episodeRuntimes.set(`S${activeSeason}E${ep.episode_number}`, ep.runtime * 60);
      }
      episodeDetails.set(`S${activeSeason}E${ep.episode_number}`, {
        still_path: ep.still_path || null,
        name: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || ''
      });
    });

    await cacheSeasonEpisodesWithProgress(tvId, activeSeason, episodes);

    const activeEpRuntime = episodeRuntimes.get(`S${activeSeason}E${activeEpisode}`);
    if (activeEpRuntime) tmdbRuntimeSeconds = activeEpRuntime;

    if (window.lucide) window.lucide.createIcons();

    return episodes.length;

  } catch (err) {
    console.error('[loadMobileEpisodes] error:', err);
    listContainer.innerHTML = `<p style="color:var(--text-muted);padding:var(--space-md)">Failed to load episodes.</p>`;
    return 0;
  }
}

async function renderMobileLayout({
  data,
  type,
  id,
  isTV,
  container,
  imdbId,
  title,
  year,
  rating,
  genres,
  runtime,
  similar,
  poster_path,
  hashQuery,
  urlParams,
  currentSeason,
  currentEpisode
}) {
  const cleanTitle = title.replace(/\[.*?\]/g, '').trim();

  container.innerHTML = `
    <div class="mobile-player-page animate-fade-in">
      <div class="mobile-player-container" id="video-wrapper">
        <div class="player-loading-overlay" id="player-loading">
          <div class="player-loading-spinner"></div>
          <div class="player-loading-text">Fetching stream...</div>
        </div>
      </div>

      <div class="mobile-player-scroll-content">
        <div class="mobile-player-meta">
          <h1 class="mobile-player-title">${title}</h1>
          
          <div class="mobile-player-badges">
            <span class="mobile-player-badge highlight">â­ ${rating}</span>
            ${year ? `<span class="mobile-player-badge">${year}</span>` : ''}
            ${runtime ? `<span class="mobile-player-badge">${runtime}</span>` : ''}
            <span class="mobile-player-badge">${isTV ? 'TV Series' : 'Movie'}</span>
            ${genres ? genres.split(' â€¢ ').map(g => `<span class="mobile-player-badge">${g}</span>`).join('') : ''}
          </div>

          <div class="mobile-player-synopsis-container">
            <p class="mobile-player-synopsis" id="mobile-synopsis">${data.overview || 'No description available.'}</p>
            ${data.overview && data.overview.length > 100 ? `<span class="mobile-player-more-link" id="mobile-more-link">More</span>` : ''}
          </div>
        </div>



        <div class="mobile-player-actions">
          <button class="mobile-player-action-item" id="action-play" aria-label="Play">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Play</span>
          </button>
          <button class="mobile-player-action-item" id="action-download" aria-label="Download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Download</span>
          </button>
          <button class="mobile-player-action-item" id="action-watchlist" aria-label="Add to Watchlist">
            <svg id="watchlist-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
            <span id="watchlist-text">Watchlist</span>
          </button>
          <button class="mobile-player-action-item" id="action-share" aria-label="Share">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            <span>Share</span>
          </button>
          <button class="mobile-player-action-item" id="action-cast" aria-label="Cast to TV">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 8.95 20M2 8A13 13 0 0 1 13.99 20M2 20h.01"></path><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.3"></rect></svg>
            <span>Cast</span>
          </button>
        </div>

        ${isTV ? `
          <div class="mobile-player-episodes-section">
            <div class="seasons-tabs-wrapper mobile-seasons" id="mobile-season-chips" role="tablist"></div>
            <div class="mobile-episodes-list" id="mobile-episodes-list"></div>
            <button class="mobile-ep-show-all-btn" id="mobile-show-all-btn" style="display: none;" aria-label="Show All Episodes">
              <span>Show All</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>
        ` : ''}

        ${similar.length ? `
          <div class="player-related" style="margin-top: 24px;">
            <h2 class="player-related-title" style="font-size: 16px; margin-bottom: 12px; font-weight: 700;">More Like This</h2>
            <div class="player-related-grid">
              ${similar.map(m => createMovieCard(m, type, null, null, null, false, 'landscape')).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  setupWatchlistButton(id, type);
  attachCardClicks(container);

  const synopsisEl = document.getElementById('mobile-synopsis');
  const moreLink = document.getElementById('mobile-more-link');
  if (moreLink && synopsisEl) {
    moreLink.addEventListener('click', () => {
      synopsisEl.classList.toggle('expanded');
      moreLink.textContent = synopsisEl.classList.contains('expanded') ? 'Less' : 'More';
    });
  }

  // ---- Rotation Interceptors for Play Controls ----
  async function checkAndTriggerRotation(onAllowed) {
    const consent = localStorage.getItem('piq_auto_rotate_consent');
    if (consent === 'allowed' || consent === 'only_this_time_temp') {
      await requestRotateAndFullscreen(onAllowed);
    } else {
      // Create beautifully overlayed non-blocking consent toast
      const toast = document.createElement('div');
      toast.className = 'rotate-consent-toast animate-slide-up';
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 16px;
        right: 16px;
        background: rgba(15, 15, 24, 0.95);
        border: 1px solid rgba(168, 85, 247, 0.4);
        border-radius: 12px;
        padding: 12px 16px;
        z-index: 10000;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;
      toast.innerHTML = `
        <div style="font-size: 12px; font-weight: 500; color: #fff; line-height: 1.4;">Tap Play to watch in landscape. Allow auto-rotate for full-screen?</div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="consent-only-time" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 600; cursor: pointer; min-height: 32px;">Only this time</button>
          <button id="consent-allow" style="background: var(--accent); border: none; color: #fff; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 600; cursor: pointer; box-shadow: var(--shadow-glow-sm); min-height: 32px;">Allow</button>
        </div>
      `;
      document.body.appendChild(toast);

      toast.querySelector('#consent-allow').addEventListener('click', async () => {
        localStorage.setItem('piq_auto_rotate_consent', 'allowed');
        toast.remove();
        await requestRotateAndFullscreen(onAllowed);
      });

      toast.querySelector('#consent-only-time').addEventListener('click', async () => {
        localStorage.setItem('piq_auto_rotate_consent', 'only_this_time_temp');
        toast.remove();
        await requestRotateAndFullscreen(onAllowed);
      });
    }
  }

  async function requestRotateAndFullscreen(onComplete) {
    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper) {
      onComplete();
      return;
    }

    try {
      if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
      } else if (wrapper.webkitRequestFullscreen) {
        await wrapper.webkitRequestFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen request failed:', e);
    }

    if (screen.orientation && screen.orientation.lock) {
      try {
        await screen.orientation.lock('landscape');
        pushTelemetry('entered_landscape', { method: 'auto' });
      } catch (err) {
        console.warn('Orientation lock failed:', err);
        showRotationFallbackModal(onComplete);
        return;
      }
    } else {
      showRotationFallbackModal(onComplete);
      return;
    }

    onComplete();
  }

  function showRotationFallbackModal(onComplete) {
    const existing = document.querySelector('.rotate-fallback-overlay');
    if (existing) existing.remove();

    const fallback = document.createElement('div');
    fallback.className = 'rotate-fallback-overlay';
    fallback.innerHTML = `
      <div class="rotate-fallback-title">Rotate Your Device</div>
      <div class="rotate-fallback-sub">Please rotate your device to landscape mode, or tap the button below to manually enter fullscreen.</div>
      <button class="rotate-fallback-btn" id="fallback-fullscreen-btn" aria-label="Enter Fullscreen Manually">Go Fullscreen</button>
      <button class="rotate-fallback-close" style="position: absolute; top: 16px; right: 16px; background: none; border: none; color: rgba(255,255,255,0.5); font-size: 24px; cursor: pointer; min-height: 44px; min-width: 44px;" aria-label="Close modal">&times;</button>
    `;
    document.body.appendChild(fallback);

    fallback.querySelector('#fallback-fullscreen-btn').addEventListener('click', () => {
      const wrapper = document.getElementById('video-wrapper');
      if (wrapper) {
        if (wrapper.requestFullscreen) wrapper.requestFullscreen();
        else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
      }
      fallback.remove();
      pushTelemetry('entered_landscape', { method: 'manual' });
      onComplete();
    });

    fallback.querySelector('.rotate-fallback-close').addEventListener('click', () => {
      fallback.remove();
      onComplete();
    });
  }

  // Bind rotation check to global hook for episode row plays
  window._checkAndTriggerRotation = checkAndTriggerRotation;



  const playBtn = document.getElementById('action-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const activeVideo = document.getElementById('vp-video');
      if (activeVideo) {
        if (activeVideo.paused) {
          checkAndTriggerRotation(() => activeVideo.play());
        } else {
          activeVideo.pause();
        }
      } else {
        checkAndTriggerRotation(() => startPlayback(0));
      }
    });
  }

  const downloadBtn = document.getElementById('action-download');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      pushTelemetry('download_requested', { id, type, season: currentSeason, episode: currentEpisode });
      alert('Download starting...');
    });
  }

  const shareBtn = document.getElementById('action-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const shareUrl = window.location.href;
      if (navigator.share) {
        navigator.share({
          title: `PlayerIQ - Watch ${title}`,
          url: shareUrl
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareUrl);
        alert('Share link copied to clipboard!');
      }
    });
  }

  const castBtn = document.getElementById('action-cast');
  if (castBtn) {
    castBtn.addEventListener('click', () => {
      triggerCastDialog();
    });
  }

  async function setupWatchlistButton(contentId, contentType) {
    const listBtn = document.getElementById('action-watchlist');
    const listIcon = document.getElementById('watchlist-icon');
    const listText = document.getElementById('watchlist-text');
    if (!listBtn) return;

    const user = getUser();
    if (user) {
      let inList = await isInWatchlist(user.uid, contentId);
      
      const updateButtonUI = (inListState) => {
        if (inListState) {
          listIcon.setAttribute('fill', 'currentColor');
          listIcon.style.color = '#a855f7';
          listText.textContent = 'Added';
          listBtn.classList.add('in-list');
        } else {
          listIcon.setAttribute('fill', 'none');
          listIcon.style.color = 'currentColor';
          listText.textContent = 'Watchlist';
          listBtn.classList.remove('in-list');
        }
      };

      updateButtonUI(inList);

      listBtn.addEventListener('click', async () => {
        const isNowIn = listBtn.classList.contains('in-list');
        listBtn.disabled = true;
        
        try {
          if (isNowIn) {
            await removeFromWatchlist(user.uid, contentId);
            updateButtonUI(false);
          } else {
            const mediaObj = {
              id: contentId,
              title: title,
              name: title,
              type: contentType,
              poster_path: poster_path,
              backdrop_path: data.backdrop_path,
              vote_average: data.vote_average,
              release_date: data.release_date || '',
              first_air_date: data.first_air_date || ''
            };
            await addToWatchlist(user.uid, mediaObj);
            updateButtonUI(true);
          }
        } catch (err) {
          console.error('[Watchlist Error]', err);
        } finally {
          listBtn.disabled = false;
        }
      });
    } else {
      listBtn.addEventListener('click', () => navigate('/watchlist'));
    }
  }

  function formatTime(s) {
    if (isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`;
  }


  const activeVideo = window.activeVideoElement;
  let reusedVideo = false;

  if (activeVideo && 
      String(window.activeMediaId) === String(id) && 
      String(window.activeMediaType) === String(type) &&
      Number(window.activeMediaSeason) === Number(currentSeason) &&
      Number(window.activeMediaEpisode) === Number(currentEpisode)) {
    
    console.log('[Mobile Player] Relocating active video element back...');
    const wrapper = document.getElementById('video-wrapper');
    if (wrapper) {
      const loaderEl = document.getElementById('player-loading');
      if (loaderEl) loaderEl.remove();

      reusedVideo = true;
      const miniPlayer = document.getElementById('global-mini-player');
      if (miniPlayer) miniPlayer.remove();

      const streamData = activeVideo._streamData || { url: activeVideo.src, type: type === 'hls' ? 'hls' : 'mp4' };
      streamData.isTV = isTV;

      activePlayer = createVideoPlayer(
        wrapper,
        streamData,
        {
          onProgress: (currentTime, duration) => {
            saveProgress({
              id,
              title,
              type: isTV ? 'tv' : 'movie',
              poster_path,
              backdrop_path: data.backdrop_path,
              season: currentSeason,
              episode: currentEpisode,
              currentTime,
              duration
            });
          },
          onFatalError: () => {
            const wasFullscreen = !!document.fullscreenElement;
            activePlayer.destroy(false, wasFullscreen);
            activePlayer = null;
            loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
          },
          onEnded: handlePlaybackEnded,
          startTime: 0,
          existingVideo: activeVideo,
          episodes: currentSeasonEpisodes,
          currentSeason,
          currentEpisode,
          goToEpisode
        }
      );

      window.activeVideoElement = null;
      window.activeMediaId = null;
      window.activeMediaType = null;
      window.activeMediaSeason = null;
      window.activeMediaEpisode = null;
    }
  }

  if (!reusedVideo) {
    const piqAutoplay = localStorage.getItem('piq_autoplay');
    
    if (piqAutoplay === 'true') {
      startPlayback(0);
    } else {
      const wrapper = document.getElementById('video-wrapper');
      if (wrapper) {
        const loaderEl = document.getElementById('player-loading');
        if (loaderEl) loaderEl.remove();

        const playOverlay = document.createElement('div');
        playOverlay.className = 'mobile-player-play-overlay';
        playOverlay.id = 'mobile-play-overlay';
        playOverlay.innerHTML = `
          <button class="mobile-player-play-btn" id="mobile-play-overlay-btn" aria-label="Play Video">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:28px;height:28px;margin-left:4px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <div style="font-size:14px;font-weight:700;color:white;text-transform:uppercase;letter-spacing:1px;">Tap to Play</div>
        `;
        wrapper.appendChild(playOverlay);

        playOverlay.addEventListener('click', () => {
          localStorage.setItem('piq_autoplay', 'true');
          playOverlay.remove();
          checkAndTriggerRotation(() => startPlayback(0));
        });
      }
    }
  }

  function startPlayback(seekTime = 0) {
    loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode, goToEpisode);
  }

  function nextEpisode() {
    if (isTV) {
      if (currentEpisode < totalEpisodes) {
        goToEpisode(currentSeason, currentEpisode + 1);
      }
    } else if (similar && similar.length > 0) {
      const nextId = similar[0].id;
      window.location.hash = `/watch/movie/${nextId}`;
    }
  }

  function prevEpisode() {
    if (currentEpisode > 1) {
      goToEpisode(currentSeason, currentEpisode - 1);
    }
  }

  async function goToEpisode(season, episode) {
    currentSeason = season;
    currentEpisode = episode;
    window.location.hash = `/watch/${type}/${id}?s=${season}&e=${episode}`;
  }

  function handlePlaybackEnded() {
    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper) return;
    wrapper.querySelectorAll('.vp-countdown-overlay, .vp-recommendations-overlay').forEach(el => el.remove());
    const nextEpNum = currentEpisode + 1;
    if (isTV && nextEpNum <= totalEpisodes) {
      showAutoPlayCountdown(nextEpNum);
    } else {
      showRecommendationsOverlay();
    }
  }

  function showAutoPlayCountdown(nextEpNum) {
    let count = 5;
    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper) return;
    const overlay = document.createElement('div');
    overlay.className = 'vp-countdown-overlay';
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 150;
      color: #fff;
      font-family: var(--font-display);
      animation: fadeIn 0.4s ease;
    `;

    overlay.innerHTML = `
      <div style="font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--text-secondary); margin-bottom: var(--space-xs);">Up Next</div>
      <div style="font-size: var(--text-2xl); font-weight: var(--weight-bold); margin-bottom: var(--space-lg); text-align: center; max-width: 80%; text-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        S${currentSeason} E${nextEpNum}
      </div>
      <div style="position: relative; width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-xl);">
        <svg width="120" height="120" style="transform: rotate(-90deg);">
          <circle cx="60" cy="60" r="50" fill="transparent" stroke="rgba(255,255,255,0.1)" stroke-width="8"></circle>
          <circle class="countdown-circle" cx="60" cy="60" r="50" fill="transparent" stroke="var(--accent)" stroke-width="8" stroke-dasharray="314.16" stroke-dashoffset="0" style="transition: stroke-dashoffset 1s linear;"></circle>
        </svg>
        <span class="countdown-seconds" style="position: absolute; font-size: var(--text-3xl); font-weight: var(--weight-bold); text-shadow: 0 2px 10px rgba(229,9,20,0.5);">5</span>
      </div>
      <div style="display: flex; gap: var(--space-md);">
        <button class="countdown-cancel-btn" style="
          padding: 10px 24px;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          color: var(--text-primary);
          font-weight: var(--weight-semibold);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all 0.3s;
        " aria-label="Cancel Autoplay">Cancel</button>
        <button class="countdown-play-btn" style="
          padding: 10px 24px;
          border-radius: var(--radius-sm);
          background: var(--accent);
          border: none;
          color: white;
          font-weight: var(--weight-semibold);
          font-size: var(--text-sm);
          cursor: pointer;
          box-shadow: var(--shadow-glow-sm);
          transition: all 0.3s;
        " aria-label="Play Next Episode Now">Play Now</button>
      </div>
    `;

    wrapper.appendChild(overlay);

    const circle = overlay.querySelector('.countdown-circle');
    const text = overlay.querySelector('.countdown-seconds');

    const interval = setInterval(() => {
      count--;
      if (text) text.textContent = count;
      if (circle) {
        const dashoffset = 314.16 * ((5 - count) / 5);
        circle.style.strokeDashoffset = dashoffset;
      }

      if (count <= 0) {
        clearInterval(interval);
        overlay.remove();
        nextEpisode();
      }
    }, 1000);

    overlay.querySelector('.countdown-cancel-btn').addEventListener('click', () => {
      clearInterval(interval);
      overlay.remove();
      showRecommendationsOverlay();
    });

    overlay.querySelector('.countdown-play-btn').addEventListener('click', () => {
      clearInterval(interval);
      overlay.remove();
      nextEpisode();
    });
  }

  function showRecommendationsOverlay() {
    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper || !similar.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'vp-recommendations-overlay';
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(10,10,15,0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 140;
      color: #fff;
      font-family: var(--font-display);
      animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      padding: var(--space-lg);
    `;

    const recCards = similar.slice(0, 3).map(item => {
      const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : 'data:image/svg+xml,...';
      const ratingVal = item.vote_average ? item.vote_average.toFixed(1) : 'â€”';
      const itemYear = (item.release_date || item.first_air_date || '').slice(0, 4);
      const cardRoute = `/${type}/${item.id}`;
      
      return `
        <div class="rec-card" data-route="${cardRoute}" style="
          width: 140px;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          gap: var(--space-2xs);
        " role="button" aria-label="View ${item.title || item.name}">
          <div style="
            position: relative;
            width: 100%;
            height: 200px;
            border-radius: var(--radius-sm);
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: var(--shadow-card);
          ">
            <img src="${posterUrl}" alt="${item.title || item.name}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s;" class="rec-poster" />
            <div style="
              position: absolute;
              top: 8px;
              right: 8px;
              background: rgba(10,10,15,0.85);
              backdrop-filter: blur(4px);
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: var(--weight-bold);
              color: var(--rating-high);
              border: 1px solid rgba(255,255,255,0.06);
            ">â­ ${ratingVal}</div>
          </div>
          <div style="
            font-size: var(--text-sm);
            font-weight: var(--weight-bold);
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 4px;
          ">${item.title || item.name}</div>
          <div style="font-size: 10px; color: var(--text-muted);">${itemYear}</div>
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <button class="rec-replay-btn" style="
        position: absolute;
        top: var(--space-lg);
        right: var(--space-lg);
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        color: white;
        padding: 8px 16px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: var(--text-xs);
        font-weight: var(--weight-bold);
        cursor: pointer;
        transition: all 0.3s;
      " aria-label="Replay current video">
        Replay Video
      </button>
      <div style="font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--accent); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: var(--space-xs);">Finished Playing</div>
      <div style="font-size: var(--text-xl); font-weight: var(--weight-extrabold); margin-bottom: var(--space-xl);">More Like This</div>
      <div class="rec-cards-container" style="
        display: flex;
        gap: var(--space-lg);
        justify-content: center;
        width: 100%;
        margin-bottom: var(--space-lg);
      ">
        ${recCards}
      </div>
    `;

    wrapper.appendChild(overlay);

    overlay.querySelectorAll('.rec-card').forEach(card => {
      const poster = card.querySelector('.rec-poster');
      card.addEventListener('mouseenter', () => {
        if (poster) poster.style.transform = 'scale(1.05)';
      });
      card.addEventListener('mouseleave', () => {
        if (poster) poster.style.transform = 'none';
      });
      card.addEventListener('click', () => {
        overlay.remove();
        window.location.hash = card.dataset.route;
      });
    });

    overlay.querySelector('.rec-replay-btn').addEventListener('click', () => {
      overlay.remove();
      startPlayback(0);
    });
  }

  if (isTV) {
    await loadMobileEpisodes(id, currentSeason, currentEpisode, title, data, goToEpisode);
    const epList = document.getElementById('mobile-episodes-list');
    if (epList) {
      setupSwipeGestures(epList, nextEpisode, prevEpisode);
    }
  }

  const cleanupOrientation = setupOrientationMonitor();
  pushTelemetry('player_open', { id, type, season: currentSeason, episode: currentEpisode, source: 'mobile' });

  return () => {
    disableRedirectGuard();
    clearIframeTracker();
    cleanupOrientation();

    // Reset window orientation helper hook
    window._checkAndTriggerRotation = null;

    if (screen.orientation && screen.orientation.unlock) {
      try {
        screen.orientation.unlock();
      } catch (e) {}
    }

    if (_keyHandler) {
      window.removeEventListener('keydown', _keyHandler);
      _keyHandler = null;
    }

    const videoEl = document.getElementById('vp-video');
    if (activePlayer && videoEl && !videoEl.paused) {
      console.log('[Mobile Player] Page navigating away while playing. Staging mini-player...');
      setupMiniPlayer(videoEl, activePlayer, id, type, currentSeason, currentEpisode, title, poster_path, data.backdrop_path);
      activePlayer.destroy(true);
      activePlayer = null;
    } else {
      if (activePlayer) {
        activePlayer.destroy();
        activePlayer = null;
      }
    }
  };
}
