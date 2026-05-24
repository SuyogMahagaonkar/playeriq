// ========================================
// PlayerIQ — Player Page (Cinema Mode)
// ========================================

import { getMovieDetails, getTVDetails, getSeasonDetails, img, NODE_PROXY } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { navigate } from '../services/router.js';
import { createVideoPlayer } from '../components/VideoPlayer.js';

import { saveProgress, getWatchHistory, getUser } from '../services/auth.js';
import { isInWatchlist, addToWatchlist, removeFromWatchlist } from '../services/firebase.js';
import { DownloadManager } from '../services/download.js';

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
let iframeInterval = null;
let isOfflinePlayback = false;

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
  mini.setAttribute('aria-label', 'Mini player — tap to restore');
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
        episode_overview: epOverview
      });

      // Stop tracking if fully watched (under 5 min left)
      if (duration - simulatedCurrentTime <= 300) {
        console.log('[Iframe Tracker] Fully watched (under 5 min remaining). Clearing.');
        clearInterval(iframeInterval);
        iframeInterval = null;
      }
    }, 5000);
  });
}

let tmdbRuntimeSeconds = null; // TMDB runtime in seconds — used as duration fallback for slider
let episodeRuntimes = new Map(); // key: `S${season}E${ep}` — per-episode runtime in seconds
let episodeDetails = new Map(); // key: `S${season}E${ep}` — episode metadata (still_path, name, overview)
let totalEpisodes = 0;

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
      // If already watched or less than 5 minutes remaining, play from start
      if (match.watched) return 0;
      if (match.duration > 0 && (match.duration - match.currentTime <= 300)) return 0;

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
async function loadPlayer(id, isTV, season, episode, title, imdbId, posterPath = null, backdropPath = null, onEnded = null, onNextEpisodeClick = null) {
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
        (currentTime, duration) => {
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
        () => {
          console.warn('[Player] Offline player error callback');
        },
        onEnded,
        startTime
      );
    };

    // ✅ PRODUCTION: If user has downloaded this item, ALWAYS play the local file
    // This works whether online or offline — the downloaded copy takes priority
    if (match) {
      console.log(`[PlayerPage] Found completed local download for ${downloadId} — playing offline copy`);
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

      // Use NODE_PROXY (production API URL) — NOT localhost.
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
          (currentTime, duration) => {
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
          () => {
            // onFatalError callback
            console.warn('[Player] Custom player failed or timed out. Switching to iframe fallback...');
            if (activePlayer) {
              activePlayer.destroy();
              activePlayer = null;
            }
            loadIframeFallback();
          },
          onEnded,
          startTime
        );

        // MediaSession & Video Title: show title + artwork on lock screen/top bar
        if (wrapper._initMediaSession) {
          wrapper._initMediaSession(
            title,
            isTV ? `Season ${season} · Episode ${episode}` : '',
            posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '',
            null, // onPrev — wired up later via onNextEpisodeClick
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
          overview: `Offline Playback • Locally stored title inside IndexedDB.`,
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
            overview: `Offline Playback • Locally stored title inside IndexedDB.`,
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

    // Save initial progress (Movies only — TV shows will save after metadata loads)
    if (!isTV) {
      saveProgress({ id, title, type: 'movie', poster_path, season: currentSeason, episode: currentEpisode });
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
            <div class="player-video-wrapper mobile-player-container" id="video-wrapper">
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
                ${isTV ? `<span>•</span><span class="player-meta-episode">S${currentSeason} E${currentEpisode}</span>` : ''}
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
    }

    // For TV: load episode list FIRST so episodeRuntimes is populated
    // before loadPlayer runs, giving the player the correct episode duration.
    if (isTV) {
      const loadedEpCount = await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);
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
        id,
        title,
        type: 'tv',
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        season: currentSeason,
        episode: currentEpisode,
        episode_title: epTitle,
        episode_still: epStill,
        episode_overview: epOverview
      });

      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
    } else {
      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
    }

    // ---- Helper functions for episode navigation ----
    async function goToEpisode(season, episode) {
      currentSeason = season;
      currentEpisode = episode;

      // Load episodes first to ensure metadata is refreshed/cached
      const loadedEpCount = await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);
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
        id,
        title,
        type: 'tv',
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        season: currentSeason,
        episode: currentEpisode,
        episode_title: epTitle,
        episode_still: epStill,
        episode_overview: epOverview
      });

      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
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
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '—';
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
              ">⭐ ${rating}</div>
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
        loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
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

    // Source selector
    document.getElementById('source-select')?.addEventListener('change', (e) => {
      currentSourceIndex = parseInt(e.target.value);
      localStorage.setItem('piq_source', currentSourceIndex);
      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
    });

    // Mode selector
    document.getElementById('mode-select')?.addEventListener('change', (e) => {
      currentPlayerMode = e.target.value;
      localStorage.setItem('piq_player_mode', currentPlayerMode);

      const sourceSelect = document.getElementById('source-select');
      if (sourceSelect) {
        sourceSelect.style.display = currentPlayerMode === 'custom' ? 'none' : 'inline-block';
      }

      loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
    });

    // TV season/episode handling
    if (isTV && data.seasons?.length) {
      await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);

      document.getElementById('player-season-select')?.addEventListener('change', async (e) => {
        currentSeason = parseInt(e.target.value);
        currentEpisode = 1;
        // Update total episodes from the actual loaded season
        totalEpisodes = await loadPlayerEpisodes(id, currentSeason, currentEpisode, title, data.poster_path, data.backdrop_path, cleanTitle, year, handlePlaybackEnded, goToEpisode);
        loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, data.poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
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

    listEl.innerHTML = episodes.map(ep => `
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

    // Store per-episode runtimes and metadata details
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

    // Set tmdbRuntimeSeconds to the active episode's runtime right away
    const activeEpRuntime = episodeRuntimes.get(`S${seasonNumber}E${activeEpisode}`);
    if (activeEpRuntime) tmdbRuntimeSeconds = activeEpRuntime;

    // Episode click handlers
    listEl.querySelectorAll('.player-episode-item').forEach(item => {
      item.addEventListener('click', () => {
        const epNum = parseInt(item.dataset.episode);
        const sNum = parseInt(item.dataset.season);

        if (onEpisodeClick) {
          onEpisodeClick(sNum, epNum);
        } else {
          // Update runtime BEFORE loadPlayer so the player gets the right duration
          const epRuntime = episodeRuntimes.get(`S${sNum}E${epNum}`);
          if (epRuntime) tmdbRuntimeSeconds = epRuntime;

          // Load the episode
          loadPlayer(tvId, true, sNum, epNum, title, null, posterPath, backdropPath, onEnded);

          // Update active state
          listEl.querySelectorAll('.player-episode-item').forEach(el => {
            el.classList.remove('active');
            const playingTag = el.querySelector('.player-episode-playing');
            if (playingTag) playingTag.remove();
          });
          item.classList.add('active');
          item.insertAdjacentHTML('beforeend', '<div class="player-episode-playing">▶ Now Playing</div>');

          updateNowPlaying(sNum, epNum);
        }
      });
    });

    // Scroll active episode into view
    const activeEl = listEl.querySelector('.player-episode-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });

    return episodes.length;

  } catch (err) {
    console.error('[loadPlayerEpisodes] error:', err);
    listEl.innerHTML = '<p style="color:var(--text-muted);padding:var(--space-md)">Failed to load episodes.</p>';
    return 0;
  }
}

// ====================================================
// 📱 PORTRAIT-FIRST MOBILE REDESIGN IMPLEMENTATION
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
  
  const subText = type === 'tv' ? `Season ${season} · Episode ${episode}` : 'Movie';
  
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

// ---- Dynamic Casting Integrations ----
function loadGoogleCastSDK() {
  if (window.chrome && window.chrome.cast) return;
  const script = document.createElement('script');
  script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  document.head.appendChild(script);
}

const SIMULATED_DEVICES = [
  { id: 'chromecast-living', name: 'Living Room TV', type: 'Chromecast', status: 'ready', signal: 4 },
  { id: 'airplay-bedroom', name: 'Bedroom Apple TV', type: 'AirPlay', status: 'ready', signal: 5 },
  { id: 'dlna-basement', name: 'Basement Sony Bravia', type: 'Smart TV', status: 'ready', signal: 3 },
  { id: 'chromecast-kitchen', name: 'Kitchen Hub', type: 'Chromecast', status: 'ready', signal: 2 }
];

function stopCastingFlow() {
  if (window.castPollingInterval) {
    clearInterval(window.castPollingInterval);
    window.castPollingInterval = null;
  }
  const bar = document.getElementById('global-cast-session-bar');
  if (bar) bar.remove();
  localStorage.removeItem('piq_cast_session_id');
}

function startCastSessionPolling(sessionId) {
  if (window.castPollingInterval) clearInterval(window.castPollingInterval);

  window.castPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/cast/session/status?sessionId=${sessionId}`);
      if (!res.ok) {
        stopCastingFlow();
        return;
      }
      const status = await res.json();
      updateCastBarUI(status);
    } catch (err) {
      console.error('[Cast Polling] Error:', err);
    }
  }, 2000);
}

function updateCastBarUI(status) {
  const statusEl = document.getElementById('cast-bar-status');
  const playBtn = document.getElementById('cast-bar-play-btn');
  if (statusEl) {
    statusEl.textContent = status.state === 'PLAYING' 
      ? `Casting to ${status.deviceType}...` 
      : `Paused on ${status.deviceType}`;
  }
  if (playBtn) {
    if (status.state === 'PLAYING') {
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    } else {
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    }
  }
}

function mountGlobalCastBar(sessionId, title, imagePath) {
  const existing = document.getElementById('global-cast-session-bar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.className = 'cast-session-bar';
  bar.id = 'global-cast-session-bar';
  bar.innerHTML = `
    <div class="cast-session-details">
      <img class="cast-session-thumb" src="${imagePath ? img.backdrop(imagePath) : 'data:image/svg+xml,...'}" alt="Thumb" />
      <div class="cast-session-info">
        <h4 class="cast-session-title">${title}</h4>
        <div class="cast-session-status" id="cast-bar-status">Connecting to TV...</div>
      </div>
    </div>
    <div class="cast-session-controls">
      <button class="cast-session-btn" id="cast-bar-play-btn" aria-label="Toggle Play">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </button>
      <button class="cast-session-btn disconnect" id="cast-bar-disconnect-btn" aria-label="Stop Casting">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  `;
  document.body.appendChild(bar);

  const playBtn = bar.querySelector('#cast-bar-play-btn');
  const disconnectBtn = bar.querySelector('#cast-bar-disconnect-btn');

  let isPlaying = true;

  playBtn.addEventListener('click', async () => {
    isPlaying = !isPlaying;
    try {
      const res = await fetch('/api/cast/session/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: isPlaying ? 'play' : 'pause'
        })
      });
      if (res.ok) {
        pushTelemetry('cast_control', { sessionId, action: isPlaying ? 'play' : 'pause' });
      }
    } catch (err) {
      console.error('[Cast Bar Control] Failed:', err);
    }
  });

  disconnectBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/cast/session/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'stop'
        })
      });
      pushTelemetry('cast_control', { sessionId, action: 'stop' });
    } catch (e) {}
    stopCastingFlow();
  });

  startCastSessionPolling(sessionId);
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
            <span class="mobile-player-badge highlight">⭐ ${rating}</span>
            ${year ? `<span class="mobile-player-badge">${year}</span>` : ''}
            ${runtime ? `<span class="mobile-player-badge">${runtime}</span>` : ''}
            <span class="mobile-player-badge">${isTV ? 'TV Series' : 'Movie'}</span>
            ${genres ? genres.split(' • ').map(g => `<span class="mobile-player-badge">${g}</span>`).join('') : ''}
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

  // Setup cast API dynamically
  loadGoogleCastSDK();

  // Expose global callback for VideoPlayer cast click
  window._triggerCastingFlow = () => {
    triggerCastDialog();
  };

  function triggerCastDialog() {
    const consentModal = document.createElement('div');
    consentModal.className = 'cast-picker-modal';
    consentModal.innerHTML = `
      <div class="cast-picker-content">
        <div class="cast-picker-header">
          <h3 class="cast-picker-title">Local Network Permission</h3>
          <button class="cast-picker-close" id="consent-close" aria-label="Close Dialog">✕</button>
        </div>
        <p class="cast-microcopy">PlayerIQ needs local network permission to discover and connect to nearby Chromecast, AirPlay, or Smart TV devices.</p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="consent-cancel" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer; min-height: 44px;" aria-label="Cancel Search">Cancel</button>
          <button id="consent-search" style="background: var(--accent); border: none; color: #fff; border-radius: 8px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: var(--shadow-glow-sm); min-height: 44px;" aria-label="Search Devices">Search Devices</button>
        </div>
      </div>
    `;
    document.body.appendChild(consentModal);

    consentModal.querySelector('#consent-close').addEventListener('click', () => consentModal.remove());
    consentModal.querySelector('#consent-cancel').addEventListener('click', () => consentModal.remove());
    consentModal.querySelector('#consent-search').addEventListener('click', () => {
      consentModal.remove();
      showDevicePickerModal();
    });
  }

  function showDevicePickerModal() {
    const picker = document.createElement('div');
    picker.className = 'cast-picker-modal';
    picker.innerHTML = `
      <div class="cast-picker-content">
        <div class="cast-picker-header">
          <h3 class="cast-picker-title">Select Cast Device</h3>
          <button class="cast-picker-close" id="picker-close" aria-label="Close Device Picker">✕</button>
        </div>
        <div class="cast-microcopy" id="picker-scanning-msg">Searching for nearby casting devices on your local network...</div>
        <div class="player-loading-spinner" id="picker-loader" style="margin: 20px auto; width: 30px; height: 30px;"></div>
        <div class="cast-device-list" id="device-list-container" style="display: none;"></div>
      </div>
    `;
    document.body.appendChild(picker);

    picker.querySelector('#picker-close').addEventListener('click', () => picker.remove());

    setTimeout(() => {
      const loader = picker.querySelector('#picker-loader');
      const msg = picker.querySelector('#picker-scanning-msg');
      const listContainer = picker.querySelector('#device-list-container');
      if (loader) loader.style.display = 'none';
      if (msg) msg.textContent = 'Active casting targets found:';
      if (listContainer) {
        listContainer.style.display = 'flex';
        const SIMULATED_DEVICE_DIAGS = {
          'chromecast-living': { ip: '192.168.1.45', protocol: 'Chromecast (Ultra)', firmware: 'v1.56.275829', network: 'Home_WiFi_5G' },
          'airplay-bedroom': { ip: '192.168.1.62', protocol: 'AirPlay 2', firmware: 'tvOS 15.4.1', network: 'Home_WiFi_5G' },
          'dlna-basement': { ip: '192.168.1.88', protocol: 'DLNA / SmartTV OS', firmware: 'v4.9.1-sony', network: 'Home_WiFi_2G' },
          'chromecast-kitchen': { ip: '192.168.1.12', protocol: 'Chromecast (v3)', firmware: 'v1.49.230485', network: 'Home_WiFi_5G' }
        };

        listContainer.innerHTML = SIMULATED_DEVICES.map(device => {
          let iconMarkup = `<svg viewBox="0 0 24 24" class="cast-device-icon" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="11" y="9" width="10" height="7" rx="1" fill="currentColor" opacity="0.3"/></svg>`;
          if (device.type === 'AirPlay') {
            iconMarkup = `<svg viewBox="0 0 24 24" class="cast-device-icon" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17H19M12 5L17 11H7L12 5Z" fill="currentColor"/></svg>`;
          }
          
          const diags = SIMULATED_DEVICE_DIAGS[device.id] || { ip: '192.168.1.1', protocol: 'Unknown', firmware: 'v1.0', network: 'Unknown' };
          
          return `
            <div class="cast-device-item" data-id="${device.id}" aria-label="Cast device ${device.name}">
              <div class="cast-device-item-top">
                <div class="cast-device-info-left">
                  <div class="cast-device-icon-wrap">${iconMarkup}</div>
                  <div class="cast-device-details">
                    <span class="cast-device-name">${device.name}</span>
                    <span class="cast-device-type">${device.type}</span>
                    <span class="cast-device-status-lbl" id="status-lbl-${device.id}">Ready</span>
                  </div>
                </div>
                <div class="cast-signal-bars" title="Signal: ${device.signal}/5">
                  <svg class="signal-svg" viewBox="0 0 24 24" width="24" height="24">
                    <rect x="2" y="16" width="3" height="4" rx="1" fill="${device.signal >= 1 ? 'var(--accent, #e50914)' : 'rgba(255,255,255,0.2)'}"></rect>
                    <rect x="6" y="12" width="3" height="8" rx="1" fill="${device.signal >= 2 ? 'var(--accent, #e50914)' : 'rgba(255,255,255,0.2)'}"></rect>
                    <rect x="10" y="8" width="3" height="12" rx="1" fill="${device.signal >= 3 ? 'var(--accent, #e50914)' : 'rgba(255,255,255,0.2)'}"></rect>
                    <rect x="14" y="4" width="3" height="16" rx="1" fill="${device.signal >= 4 ? 'var(--accent, #e50914)' : 'rgba(255,255,255,0.2)'}"></rect>
                    <rect x="18" y="0" width="3" height="20" rx="1" fill="${device.signal >= 5 ? 'var(--accent, #e50914)' : 'rgba(255,255,255,0.2)'}"></rect>
                  </svg>
                </div>
              </div>
              <div class="cast-device-item-actions">
                <button class="cast-act-btn connect-btn" id="connect-${device.id}" aria-label="Connect to ${device.name}">Connect</button>
                <button class="cast-act-btn info-btn" id="info-${device.id}" aria-label="Toggle device diagnostics for ${device.name}">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </button>
                <button class="cast-act-btn more-btn" id="more-${device.id}" aria-label="More actions for ${device.name}">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="12" cy="5" r="1"></circle>
                    <circle cx="12" cy="19" r="1"></circle>
                  </svg>
                </button>
              </div>
              <div class="cast-device-diag-details" id="diag-details-${device.id}" style="display: none; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.15); margin-top: 6px; font-size: 10px; font-family: monospace; color: rgba(255,255,255,0.6); line-height: 1.4;">
                <div>IP Address: <span style="color: var(--accent, #e50914);">${diags.ip}</span></div>
                <div>Protocol: <span>${diags.protocol}</span></div>
                <div>Firmware: <span>${diags.firmware}</span></div>
                <div>Network: <span>${diags.network}</span></div>
              </div>
            </div>
          `;
        }).join('');

        listContainer.querySelectorAll('.cast-device-item').forEach(item => {
          const deviceId = item.dataset.id;
          const device = SIMULATED_DEVICES.find(d => d.id === deviceId);
          const diags = SIMULATED_DEVICE_DIAGS[deviceId] || { ip: '192.168.1.1', protocol: 'Unknown', firmware: 'v1.0', network: 'Unknown' };

          // 1. Info click handler
          const infoBtn = item.querySelector(`#info-${deviceId}`);
          const diagDetails = item.querySelector(`#diag-details-${deviceId}`);
          if (infoBtn && diagDetails) {
            infoBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const isVisible = diagDetails.style.display === 'block';
              diagDetails.style.display = isVisible ? 'none' : 'block';
              infoBtn.classList.toggle('active', !isVisible);
            });
          }

          // 2. More actions click handler
          const moreBtn = item.querySelector(`#more-${deviceId}`);
          if (moreBtn) {
            moreBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              alert(`Device Options for ${device.name}:\n- Protocol: ${diags.protocol}\n- Signal Strength: ${device.signal}/5\n- Network: ${diags.network}`);
            });
          }

          // 3. Connect button click handler
          const connectBtn = item.querySelector(`#connect-${deviceId}`);
          if (connectBtn) {
            connectBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const statusLbl = item.querySelector(`#status-lbl-${deviceId}`);
              if (statusLbl) {
                statusLbl.className = 'cast-device-status-lbl connecting';
                statusLbl.textContent = 'Connecting...';
              }
              connectBtn.disabled = true;
              connectBtn.textContent = 'Connecting';

              setTimeout(async () => {
                try {
                  const activeVideo = document.getElementById('vp-video');
                  const currentLocalTime = activeVideo ? activeVideo.currentTime : 0;
                  
                  if (activeVideo && !activeVideo.paused) {
                    activeVideo.pause();
                  }

                  const res = await fetch('/api/cast/session/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                       contentId: id,
                       episodeId: isTV ? currentEpisode : null,
                       deviceType: device.type,
                       deviceId: device.id,
                       startTime: currentLocalTime
                    })
                  });

                  if (!res.ok) throw new Error('Failed to start session');
                  const dataResponse = await res.json();
                  const sessionId = dataResponse.sessionId;

                  if (statusLbl) {
                    statusLbl.className = 'cast-device-status-lbl connected';
                    statusLbl.textContent = 'Connected';
                  }
                  connectBtn.textContent = 'Connected';
                  connectBtn.style.background = '#22c55e';

                  pushTelemetry('cast_session_started', { deviceType: device.type, deviceId: device.id, mediaId: id });
                  localStorage.setItem('piq_cast_session_id', sessionId);
                  mountGlobalCastBar(sessionId, title, data.backdrop_path || poster_path);

                  setTimeout(() => {
                    picker.remove();
                  }, 800);

                } catch (err) {
                  console.error('[Casting] Session start failed:', err);
                  if (statusLbl) {
                    statusLbl.className = 'cast-device-status-lbl';
                    statusLbl.style.color = '#ef4444';
                    statusLbl.textContent = 'Failed';
                  }
                  connectBtn.disabled = false;
                  connectBtn.textContent = 'Connect';
                }
              }, 1500);
            });
          }

          // 4. Long Press & Double Tap on the card itself to toggle diagnostics
          let lastTap = 0;
          let pressTimer = null;

          item.addEventListener('click', (e) => {
            // Check double tap
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
              e.preventDefault();
              if (diagDetails) {
                const isVisible = diagDetails.style.display === 'block';
                diagDetails.style.display = isVisible ? 'none' : 'block';
                if (infoBtn) infoBtn.classList.toggle('active', !isVisible);
              }
            }
            lastTap = currentTime;
          });

          item.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => {
              if (diagDetails) {
                const isVisible = diagDetails.style.display === 'block';
                diagDetails.style.display = isVisible ? 'none' : 'block';
                if (infoBtn) infoBtn.classList.toggle('active', !isVisible);
              }
            }, 600); // 600ms for long press
          });

          item.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
          });

          item.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
          });
        });
      }
    }, 1500);
  }

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
        (currentTime, duration) => {
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
        () => {
          activePlayer.destroy();
          activePlayer = null;
          loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
        },
        handlePlaybackEnded,
        0,
        activeVideo
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
    loadPlayer(id, isTV, currentSeason, currentEpisode, title, imdbId, poster_path, data.backdrop_path, handlePlaybackEnded, nextEpisode);
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
      const ratingVal = item.vote_average ? item.vote_average.toFixed(1) : '—';
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
            ">⭐ ${ratingVal}</div>
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
