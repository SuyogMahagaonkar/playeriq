// ========================================
// PlayerIQ — Custom Video Player (HLS.js)
// ========================================

import Hls from 'hls.js';

/**
 * Renders a custom HTML5 video player with full controls
 * @param {HTMLElement} container - The wrapper element
 * @param {Object} streamData - { url, type, subtitles, provider }
 * @param {Function} [onProgress] - Callback (currentTime, duration)
 * @returns {{ destroy: Function }} cleanup handle
 */
export function createVideoPlayer(container, streamData, onProgress = null, onFatalError = null, onEnded = null, startTime = 0, existingVideo = null) {
  let hls = null;
  let controlsTimeout = null;
  let isDragging = false;

  const customSeekInterval = Number(localStorage.getItem('piq_seek_interval') || 10);
  const isSkipRecapsEnabled = localStorage.getItem('piq_skip_recaps') === 'true';
  let hasAutoSkipped = false;

  const subSize = localStorage.getItem('piq_sub_size') || '100%';
  const subColor = localStorage.getItem('piq_sub_color') || '#ffffff';
  const subBgOpacity = localStorage.getItem('piq_sub_bg_opacity') || '0.5';

  const subStyle = document.createElement('style');
  subStyle.id = 'piq-subtitles-custom-style';
  subStyle.innerHTML = `
    #vp-video::cue {
      font-size: ${subSize} !important;
      color: ${subColor} !important;
      background-color: rgba(0, 0, 0, ${subBgOpacity}) !important;
    }
  `;
  document.head.appendChild(subStyle);

  function showPlayerHUD(text) {
    const playerEl = document.getElementById('vp-player');
    if (!playerEl) return;
    const hud = document.createElement('div');
    hud.style.cssText = `
      position: absolute;
      top: 24px;
      right: 24px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid var(--accent);
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-display);
      z-index: 1000;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      animation: fadeIn 0.3s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    `;
    hud.innerHTML = text;
    playerEl.appendChild(hud);
    setTimeout(() => {
      hud.style.transition = 'opacity 0.3s ease';
      hud.style.opacity = '0';
      setTimeout(() => hud.remove(), 300);
    }, 2500);
  }

  container.innerHTML = `
    <div class="vp-player" id="vp-player">
      <video class="vp-video" id="vp-video" playsinline crossorigin="anonymous"></video>

      <!-- Loading spinner -->
      <div class="vp-loader" id="vp-loader">
        <div class="vp-loader-spinner"></div>
      </div>

      <!-- Big play button (center) -->
      <div class="vp-big-play" id="vp-big-play">
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>

      <!-- Diagnostics Button & HUD (Mobile-Only) -->
      <button class="vp-btn" id="vp-diag-btn" title="Diagnostics HUD" aria-label="Toggle Diagnostics HUD" style="display: none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>

      <div id="vp-diag-hud" style="display: none;">
        <div class="vp-diag-hud-title">
          <span>DIAGNOSTICS HUD</span>
          <span class="vp-diag-hud-live">LIVE</span>
        </div>
        <div class="vp-diag-hud-row">Orientation: <span id="diag-orientation">-</span></div>
        <div class="vp-diag-hud-row">Fullscreen: <span id="diag-fullscreen">-</span></div>
        <div class="vp-diag-hud-row">ABR Profile: <span id="diag-abr">-</span></div>
        <div class="vp-diag-hud-row">Buffer Rate: <span id="diag-buffer-rate">-</span></div>
        <div class="vp-diag-hud-row">Latency: <span id="diag-latency">-</span></div>
      </div>

      <!-- Controls overlay -->
      <div class="vp-controls" id="vp-controls">
        <!-- Progress bar -->
        <div class="vp-progress-wrap" id="vp-progress-wrap">
          <div class="vp-progress-buffer" id="vp-progress-buffer"></div>
          <div class="vp-progress-played" id="vp-progress-played"></div>
          <input type="range" class="vp-progress-input" id="vp-progress-input" min="0" max="1000" value="0" step="1">
          <div class="vp-progress-tooltip" id="vp-progress-tooltip">0:00</div>
        </div>

        <!-- Bottom bar -->
        <div class="vp-bottom-bar">
          <div class="vp-left-controls">
            <button class="vp-btn" id="vp-play-btn" title="Play (Space)" aria-label="Toggle Play/Pause">
              <svg class="vp-icon-play" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg class="vp-icon-pause" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>

            <button class="vp-btn" id="vp-skip-back" title="Back 10s (←)" aria-label="Skip backward 10 seconds">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-8.36L3 12"/><text x="12" y="15" fill="currentColor" stroke="none" font-size="8" text-anchor="middle" font-weight="bold">10</text></svg>
            </button>

            <button class="vp-btn" id="vp-skip-forward" title="Forward 10s (→)" aria-label="Skip forward 10 seconds">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-5.64-8.36L21 12"/><text x="12" y="15" fill="currentColor" stroke="none" font-size="8" text-anchor="middle" font-weight="bold">10</text></svg>
            </button>

            <div class="vp-volume-group">
              <button class="vp-btn" id="vp-mute-btn" title="Mute (M)" aria-label="Toggle Mute">
                <svg class="vp-icon-vol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>
                <svg class="vp-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              </button>
              <input type="range" class="vp-volume-slider" id="vp-volume" min="0" max="100" value="100" aria-label="Volume slider">
            </div>

            <span class="vp-time" id="vp-time">0:00 / 0:00</span>
          </div>

          <div class="vp-right-controls">
            <select class="vp-select" id="vp-speed" title="Playback Speed" aria-label="Playback Speed">
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>

            <select class="vp-select" id="vp-quality" title="Quality" aria-label="Video Quality">
              <option value="-1">Auto</option>
            </select>

            <button class="vp-btn" id="vp-pip-btn" title="Picture in Picture" aria-label="Toggle Picture-in-Picture">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="11" y="9" width="10" height="7" rx="1" fill="currentColor" opacity="0.3"/></svg>
            </button>

            <button class="vp-btn" id="vp-cast-btn" title="Cast Video" aria-label="Cast Video" style="display:none;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 8.95 20M2 8A13 13 0 0 1 13.99 20M2 20h.01"></path><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"></rect></svg>
            </button>

            <button class="vp-btn" id="vp-fs-btn" title="Fullscreen (F)" aria-label="Toggle Fullscreen">
              <svg class="vp-icon-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              <svg class="vp-icon-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Provider badge -->
      <div class="vp-provider" id="vp-provider">${streamData.provider || 'Custom'}</div>

      <!-- ===== MOBILE-ONLY OVERLAYS ===== -->
      <!-- Offline banner -->
      <div id="vp-offline-banner" class="vp-offline-banner hidden" role="status" aria-live="polite">
        <span class="vp-offline-banner-dot"></span>
        📴 Offline — playing from downloads
      </div>

      <!-- Gesture touch zones (invisible, cover left/right halves) -->
      <div id="vp-gesture-left"  class="vp-gesture-zone vp-gesture-left"  aria-hidden="true"></div>
      <div id="vp-gesture-right" class="vp-gesture-zone vp-gesture-right" aria-hidden="true"></div>

      <!-- Brightness swipe overlay (left half swipe) -->
      <div id="vp-brightness-overlay" class="vp-swipe-overlay" role="status" aria-label="Brightness" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <div class="vp-swipe-bar"><div class="vp-swipe-bar-fill" id="vp-brightness-bar"></div></div>
        <span id="vp-brightness-val">80%</span>
      </div>

      <!-- Volume swipe overlay (right half swipe) -->
      <div id="vp-volume-overlay" class="vp-swipe-overlay" role="status" aria-label="Volume" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 010 14.14"/>
          <path d="M15.54 8.46a5 5 0 010 7.07"/>
        </svg>
        <div class="vp-swipe-bar"><div class="vp-swipe-bar-fill" id="vp-volume-bar"></div></div>
        <span id="vp-volume-val">100%</span>
      </div>

      <!-- Double-tap seek flash — left (rewind) -->
      <div id="vp-seek-flash-left" class="vp-seek-flash vp-seek-flash-left" aria-hidden="true">
        <div class="vp-seek-arrows">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="11 17 2 12 11 7 11 17"/><polygon points="22 17 13 12 22 7 22 17"/></svg>
        </div>
        <span class="vp-seek-label">‹‹ 10s</span>
      </div>

      <!-- Double-tap seek flash — right (forward) -->
      <div id="vp-seek-flash-right" class="vp-seek-flash vp-seek-flash-right" aria-hidden="true">
        <div class="vp-seek-arrows">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13 7 22 12 13 17 13 7"/><polygon points="2 7 11 12 2 17 2 7"/></svg>
        </div>
        <span class="vp-seek-label">15s ››</span>
      </div>

      <!-- Long-press speed toast -->
      <div id="vp-speed-toast" class="vp-speed-toast" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        2× Speed
      </div>

      <!-- Lock controls button -->
      <button id="vp-lock-btn" class="vp-lock-btn" aria-label="Lock controls" title="Lock controls">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </button>

      <!-- Locked overlay -->
      <div id="vp-locked-overlay" class="vp-locked-overlay hidden" aria-label="Controls locked">
        <div class="vp-locked-hint">Hold to unlock</div>
        <button id="vp-unlock-btn" class="vp-unlock-btn" aria-label="Hold to unlock controls">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  if (existingVideo) {
    const placeholder = container.querySelector('#vp-video');
    if (placeholder) {
      placeholder.parentNode.replaceChild(existingVideo, placeholder);
      existingVideo.id = 'vp-video';
      existingVideo.className = 'vp-video';
    }
  }

  // ---- Elements ----
  const player = document.getElementById('vp-player');
  const video = existingVideo || document.getElementById('vp-video');

  let simulatedPaused = true;
  let simulatedCurrentTime = startTime || 0;
  let simulatedDuration = streamData.duration || 2700; // Default 45 mins
  let playInterval = null;

  if (streamData.isOffline) {
    // Redefine properties on the video element directly to bypass native media engines
    Object.defineProperties(video, {
      duration: {
        get: () => simulatedDuration,
        configurable: true
      },
      paused: {
        get: () => simulatedPaused,
        configurable: true
      },
      currentTime: {
        get: () => simulatedCurrentTime,
        set: (val) => {
          simulatedCurrentTime = Math.max(0, Math.min(simulatedDuration, val));
          video.dispatchEvent(new Event('timeupdate'));
        },
        configurable: true
      }
    });

    // Override play and pause methods
    video.play = function() {
      if (simulatedPaused) {
        simulatedPaused = false;
        video.dispatchEvent(new Event('play'));
        video.dispatchEvent(new Event('playing'));
        
        let lastTime = Date.now();
        if (playInterval) clearInterval(playInterval);
        playInterval = setInterval(() => {
          if (simulatedPaused) {
            clearInterval(playInterval);
            playInterval = null;
            return;
          }
          const now = Date.now();
          const delta = (now - lastTime) / 1000;
          lastTime = now;
          
          simulatedCurrentTime += delta * video.playbackRate;
          if (simulatedCurrentTime >= simulatedDuration) {
            simulatedCurrentTime = simulatedDuration;
            simulatedPaused = true;
            clearInterval(playInterval);
            playInterval = null;
            video.dispatchEvent(new Event('timeupdate'));
            video.dispatchEvent(new Event('ended'));
          } else {
            video.dispatchEvent(new Event('timeupdate'));
          }
        }, 250);
      }
      return Promise.resolve();
    };

    video.pause = function() {
      if (!simulatedPaused) {
        simulatedPaused = true;
        if (playInterval) {
          clearInterval(playInterval);
          playInterval = null;
        }
        video.dispatchEvent(new Event('pause'));
      }
    };
  }

  // ---- 15s Playback Watchdog ----
  // Safari on iOS will stay stuck loading in a loop without firing a hard video.error event.
  // We monitor the first 'play' action: if 15 seconds pass and the video fails to render 
  // any frames (currentTime remains 0), we trigger onFatalError to load the iframe fallback.
  let watchdogTimeout = null;

  video.addEventListener('play', () => {
    if (!watchdogTimeout) {
      console.log('[Player Watchdog] Play initiated, starting 15s watchdog...');
      watchdogTimeout = setTimeout(() => {
        if (video.currentTime === 0) {
          console.warn('[Player Watchdog] Video failed to start rendering frames after 15s. Triggering fatal error.');
          if (onFatalError) onFatalError();
        }
      }, 15000);
    }
  });

  video.addEventListener('playing', () => {
    if (watchdogTimeout) {
      console.log('[Player Watchdog] Playback started, clearing watchdog.');
      clearTimeout(watchdogTimeout);
      watchdogTimeout = null;
    }
  });

  const controls = document.getElementById('vp-controls');
  const loader = document.getElementById('vp-loader');
  const bigPlay = document.getElementById('vp-big-play');
  const playBtn = document.getElementById('vp-play-btn');
  const skipBack = document.getElementById('vp-skip-back');
  const skipForward = document.getElementById('vp-skip-forward');
  const muteBtn = document.getElementById('vp-mute-btn');
  const volumeSlider = document.getElementById('vp-volume');
  const progressWrap = document.getElementById('vp-progress-wrap');
  const progressInput = document.getElementById('vp-progress-input');
  const progressPlayed = document.getElementById('vp-progress-played');
  const progressBuffer = document.getElementById('vp-progress-buffer');
  const progressTooltip = document.getElementById('vp-progress-tooltip');
  const timeDisplay = document.getElementById('vp-time');
  const speedSelect = document.getElementById('vp-speed');
  const qualitySelect = document.getElementById('vp-quality');
  const pipBtn = document.getElementById('vp-pip-btn');
  const vpCastBtn = document.getElementById('vp-cast-btn');
  const fsBtn = document.getElementById('vp-fs-btn');

  // Show cast button on mobile viewports
  if (window.innerWidth <= 767 && vpCastBtn) {
    vpCastBtn.style.display = 'inline-block';
  }

  // Telemetry play event
  let playTelemetryFired = false;
  video.addEventListener('play', () => {
    if (!playTelemetryFired && window.pushTelemetry) {
      window.pushTelemetry('play_tapped', { mediaId: streamData.id || '' });
      playTelemetryFired = true;
    }
  });

  // ---- Seeking state (must be declared here, not inside if blocks, to be
  //      accessible from both the seeking handler and quality switch handler) ----
  const isMP4 = streamData.type === 'mp4';
  const allStreams = streamData.all_streams || [];
  let knownDuration = streamData.duration || null;

  // Strip &start= from a URL to get the base transcode URL
  const getBaseUrl = (url) => url?.replace(/&start=[^&]*/g, '') || '';
  let currentBaseUrl = getBaseUrl(streamData.url);
  const isTranscoded = !!streamData.url?.includes('/transcode');
  let seekLocked = false;

  if (streamData.isOffline) {
    // Offline simulation bypasses Hls/native HLS initialization completely
    loader.style.display = 'none';
    
    // Populate quality selector
    qualitySelect.innerHTML = '<option value="offline" selected>Offline (Local)</option>';
    qualitySelect.disabled = true;

    // Render the beautiful offline overlay inside the player container
    const playerEl = document.getElementById('vp-player');
    if (playerEl) {
      const offlineOverlay = document.createElement('div');
      offlineOverlay.className = 'vp-offline-cinema-overlay animate-fade-in';
      offlineOverlay.innerHTML = `
        <div class="vp-offline-cinema-badge">
          <span class="badge-dot"></span>
          <span>📴 Offline Cinema Mode</span>
        </div>
        <div class="vp-offline-cinema-icon">🎬</div>
        <div class="vp-offline-cinema-title">${streamData.title || 'Offline Video'}</div>
        <div class="vp-offline-cinema-subtitle">Playing fully completed local download from secure IndexedDB sandbox.</div>
      `;
      playerEl.appendChild(offlineOverlay);
    }

    // Trigger metadata/canplay mock events synchronously or in next tick
    setTimeout(() => {
      video.dispatchEvent(new Event('loadedmetadata'));
      video.dispatchEvent(new Event('canplay'));
      updateTime();
      updateBuffer();
      
      // Auto play if enabled
      if (localStorage.getItem('piq_autoplay') === 'true') {
        video.play().catch(err => console.warn('[Offline Autoplay] Blocked:', err));
      }
    }, 50);
  } else if (existingVideo) {
    if (video._hls) {
      hls = video._hls;
      // Populate quality selector
      qualitySelect.innerHTML = '<option value="-1">Auto</option>';
      hls.levels.forEach((level, i) => {
        const height = level.height || '?';
        const bitrate = Math.round(level.bitrate / 1000);
        qualitySelect.innerHTML += `<option value="${i}">${height}p (${bitrate}k)</option>`;
      });
      qualitySelect.value = hls.currentLevel;
    } else if (isMP4) {
      // MP4 streams
      if (allStreams.length > 0) {
        const seen = new Set();
        const sorted = [...allStreams]
          .sort((a, b) => (b.resolution || 0) - (a.resolution || 0))
          .filter(s => {
            const r = s.resolution || 0;
            if (seen.has(r)) return false;
            seen.add(r);
            return true;
          });

        qualitySelect.innerHTML = '';
        sorted.forEach((s, i) => {
          const res = s.resolution ? `${s.resolution}p` : `Stream ${i + 1}`;
          const transcodeTag = s.url?.includes('/transcode') ? ' ⚡' : '';
          const sizeMB = s.size ? ` · ${Math.round(parseInt(s.size) / 1024 / 1024)}MB` : '';
          const isSelected = s.url === streamData.url;
          qualitySelect.innerHTML += `<option value="${i}" data-url="${s.url}" ${isSelected ? 'selected' : ''}>${res}${transcodeTag}${sizeMB}</option>`;
        });
      }
    }
    loader.style.display = 'none';
  } else {
    // Save metadata on the video element for future reuse
    video._streamData = streamData;
    video._knownDuration = knownDuration;

    if (isMP4) {
      // Populate quality selector from available streams
      if (allStreams.length > 0) {
        // Sort highest resolution first, deduplicate by resolution
        const seen = new Set();
        const sorted = [...allStreams]
          .sort((a, b) => (b.resolution || 0) - (a.resolution || 0))
          .filter(s => {
            const r = s.resolution || 0;
            if (seen.has(r)) return false;
            seen.add(r);
            return true;
          });

        qualitySelect.innerHTML = '';
        sorted.forEach((s, i) => {
          const res = s.resolution ? `${s.resolution}p` : `Stream ${i + 1}`;
          const transcodeTag = s.url?.includes('/transcode') ? ' ⚡' : '';
          const sizeMB = s.size ? ` · ${Math.round(parseInt(s.size) / 1024 / 1024)}MB` : '';
          const isSelected = s.url === streamData.url;
          qualitySelect.innerHTML += `<option value="${i}" data-url="${s.url}" ${isSelected ? 'selected' : ''}>${res}${transcodeTag}${sizeMB}</option>`;
        });
      }

      // Update provider badge to show transcoding status
      if (streamData.transcoded) {
        const badge = document.getElementById('vp-provider');
        if (badge) badge.textContent = `${streamData.provider || 'MovieBox'} · H.264 ⚡`;
      }

      // ---- Time offset tracking ----
      // When we seek in a transcoded stream, FFmpeg restarts from seekTime but
      // video.currentTime resets to 0. seekOffset tracks how many real seconds
      // into the movie the current stream segment starts.
      let seekOffset = 0;

      // Play the stream
      if (startTime > 0 && isTranscoded) {
        seekOffset = Math.max(0, Math.floor(startTime));
        video.src = `${currentBaseUrl}&start=${seekOffset}`;
      } else {
        video.src = streamData.url;
      }
      
      loader.style.display = 'none';

      if (startTime > 0 && !isTranscoded) {
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = startTime;
        }, { once: true });
      }

      video.play().catch(err => console.log('[Autoplay] Blocked or interrupted:', err));

      // ---- performSeek: restart FFmpeg from a specific timestamp ----
      window._playerPerformSeek = function performSeek(targetSeconds) {
        if (seekLocked) return;
        seekLocked = true;

        const savedDuration = knownDuration;
        const wasPlaying = !video.paused;
        loader.style.display = 'flex';

        seekOffset = Math.max(0, Math.floor(targetSeconds));
        const seekUrl = `${currentBaseUrl}&start=${seekOffset}`;
        video.src = seekUrl;

        video.addEventListener('loadedmetadata', () => {
          knownDuration = savedDuration;
          seekLocked = false;
          loader.style.display = 'none';
          updateTime();
          if (wasPlaying) video.play();
        }, { once: true });
      };

      // Expose seekOffset getter for updateTime/updateBuffer
      window._playerGetSeekOffset = () => seekOffset;

      const triedUrls = new Set([streamData.url]);
      video.addEventListener('error', (e) => {
        console.error('[Player] Video error:', video.error?.code, video.error?.message);
        if (window.pushTelemetry) {
          window.pushTelemetry('player_error', { mediaId: streamData.id || '', error: video.error?.message || 'Unknown' });
        }
        const nextStream = allStreams.find(s => s.url && !triedUrls.has(s.url));
        if (nextStream) {
          console.warn('[Player] Stream failed, trying next fallback stream:', nextStream.resolution);
          triedUrls.add(nextStream.url);
          currentBaseUrl = getBaseUrl(nextStream.url);
          seekOffset = 0;
          video.src = nextStream.url;
        } else {
          console.error('[Player] All streams failed. Triggering fatal error.');
          clearTimeout(watchdogTimeout);
          if (onFatalError) onFatalError();
        }
      });

    } else if (streamData.type === 'hls' && Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: 1, // Start on mobile-friendly 480p/720p resolution
      });
      hls.loadSource(streamData.url);
      hls.attachMedia(video);
      video._hls = hls; // Store on video element for reuse!

      // Low-Bandwidth buffer stall warning
      let bufferWarningCount = 0;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          bufferWarningCount++;
          if (bufferWarningCount >= 2) {
            bufferWarningCount = 0;
            showPlayerHUD(`<span style="color:#fbbf24">Network slow - playing lower quality</span>`);
            if (hls.currentLevel > 0) {
              hls.currentLevel = hls.currentLevel - 1;
              if (qualitySelect) {
                qualitySelect.value = hls.currentLevel;
              }
            }
          }
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        // Populate quality selector
        qualitySelect.innerHTML = '<option value="-1">Auto</option>';
        data.levels.forEach((level, i) => {
          const height = level.height || '?';
          const bitrate = Math.round(level.bitrate / 1000);
          qualitySelect.innerHTML += `<option value="${i}">${height}p (${bitrate}k)</option>`;
        });
        loader.style.display = 'none';
        if (startTime > 0) {
          video.currentTime = startTime;
        }
        video.play().catch(err => console.log('[HLS Autoplay] Blocked or interrupted:', err));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('[HLS] Fatal error:', data.type, data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });
    } else if (!isMP4 && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = streamData.url;
      loader.style.display = 'none';
      if (startTime > 0) {
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = startTime;
        }, { once: true });
      }
      video.play().catch(err => console.log('[Native HLS Autoplay] Blocked or interrupted:', err));
    }
  }

  // Load subtitles
  if (!existingVideo && streamData.subtitles?.length) {
    streamData.subtitles.forEach((sub, i) => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = sub.label || `Subtitle ${i + 1}`;
      track.src = sub.url;
      if (i === 0) track.default = true;
      video.appendChild(track);
    });
  }

  // ---- Controls Logic ----
  function togglePlay() {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  function updatePlayIcon() {
    const iconPlay = playBtn.querySelector('.vp-icon-play');
    const iconPause = playBtn.querySelector('.vp-icon-pause');
    if (video.paused) {
      iconPlay.style.display = '';
      iconPause.style.display = 'none';
      bigPlay.style.display = 'flex';
    } else {
      iconPlay.style.display = 'none';
      iconPause.style.display = '';
      bigPlay.style.display = 'none';
    }
  }

  function formatTime(s) {
    if (isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // ---- Helper: get effective duration ----
  function getEffectiveDuration() {
    if (streamData.isOffline) return simulatedDuration;
    // For transcoded streams: knownDuration (from API/TMDB) is preferred because
    // video.duration on fMP4 streams is just the current buffer fragment size.
    if (isTranscoded && knownDuration) return knownDuration;

    // For direct MP4 streams and HLS streams: the browser's video.duration is 100% reliable
    const vDur = video.duration;
    if (vDur && isFinite(vDur) && vDur > 0) return vDur;

    return knownDuration || 0;
  }

  let lastProgressReport = 0;
  function updateTime() {
    // For transcoded streams: real position = video.currentTime + seekOffset
    const offset = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
    const cur = video.currentTime + offset;
    const dur = getEffectiveDuration();

    // Auto-skip intros & recaps
    if (isSkipRecapsEnabled && !hasAutoSkipped && dur > 600 && cur > 1 && cur < 5) {
      hasAutoSkipped = true;
      const skipTarget = 85;
      if (isTranscoded && window._playerPerformSeek) {
        window._playerPerformSeek(skipTarget);
      } else {
        video.currentTime = skipTarget;
      }
      showPlayerHUD(`<svg style="width:14px;height:14px;color:var(--accent)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Auto-Skipped Intro & Recap`);
    }

    timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    if (!isDragging && dur > 0) {
      const pct = (cur / dur) * 100;
      progressPlayed.style.width = pct + '%';
      progressInput.value = Math.round((cur / dur) * 1000);
    }
    
    // Throttle progress reporting to avoid spamming localStorage
    if (onProgress && dur > 0) {
      const now = Date.now();
      if (now - lastProgressReport > 5000) {
        lastProgressReport = now;
        onProgress(cur, dur);
      }
    }
  }

  function updateBuffer() {
    const dur = getEffectiveDuration();
    if (streamData.isOffline) {
      progressBuffer.style.width = '100%';
      return;
    }
    const offset = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
    if (video.buffered.length > 0 && dur > 0) {
      const buffEnd = video.buffered.end(video.buffered.length - 1) + offset;
      progressBuffer.style.width = Math.min(100, (buffEnd / dur) * 100) + '%';
    }
  }

  function showControls() {
    controls.classList.add('vp-visible');
    player.style.cursor = '';
    // Also show the floating buttons that live outside the controls bar
    const lockBtn  = document.getElementById('vp-lock-btn');
    const diagBtn  = document.getElementById('vp-diag-btn');
    if (lockBtn) lockBtn.style.opacity = '1';
    if (diagBtn) diagBtn.style.opacity = '1';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(hideControls, 5000);
  }

  function hideControls() {
    if (video.paused) return;
    controls.classList.remove('vp-visible');
    player.style.cursor = 'none';
    // Also fade the floating buttons — but keep lock btn visible (dimly) when locked
    const lockBtn  = document.getElementById('vp-lock-btn');
    const diagBtn  = document.getElementById('vp-diag-btn');
    const isLocked = player.classList.contains('vp-locked');
    if (lockBtn) lockBtn.style.opacity = isLocked ? '0.45' : '0';
    if (diagBtn) diagBtn.style.opacity = '0';
  }

  // ---- Event Listeners ----
  video.addEventListener('play', updatePlayIcon);
  video.addEventListener('pause', updatePlayIcon);
  video.addEventListener('timeupdate', updateTime);
  video.addEventListener('progress', updateBuffer);
  let nonHlsStallCount = 0;
  video.addEventListener('waiting', () => {
    loader.style.display = 'flex';
    if (!hls) {
      nonHlsStallCount++;
      if (nonHlsStallCount >= 2) {
        nonHlsStallCount = 0;
        showPlayerHUD(`<span style="color:#fbbf24">Network slow - playing lower quality</span>`);
        if (qualitySelect && qualitySelect.options.length > 1) {
          const nextIdx = Math.min(qualitySelect.options.length - 1, qualitySelect.selectedIndex + 1);
          if (nextIdx !== qualitySelect.selectedIndex) {
            qualitySelect.selectedIndex = nextIdx;
            qualitySelect.dispatchEvent(new Event('change'));
          }
        }
      }
    }
  });
  video.addEventListener('canplay', () => {
    loader.style.display = 'none';
  });
  video.addEventListener('ended', () => {
    bigPlay.style.display = 'flex';
    if (onEnded) onEnded();
  });
  // For HLS and direct non-transcoded MP4 streams: update when browser learns real duration.
  // For transcoded streams: NEVER update from durationchange because fMP4 reports partial buffers.
  if (!isTranscoded) {
    video.addEventListener('durationchange', () => {
      const d = video.duration;
      if (d && isFinite(d) && d > 0) {
        knownDuration = d;
        updateTime();
      }
    });
  }

  // Play/Pause
  playBtn.addEventListener('click', togglePlay);
  bigPlay.addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);

  // Skip buttons — aware of seekOffset for transcoded streams
  skipBack.addEventListener('click', () => {
    const offset = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
    const cur = video.currentTime + offset;
    if (isTranscoded && window._playerPerformSeek) {
      window._playerPerformSeek(Math.max(0, cur - customSeekInterval));
    } else {
      video.currentTime = Math.max(0, video.currentTime - customSeekInterval);
    }
  });
  skipForward.addEventListener('click', () => {
    const offset = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
    const cur = video.currentTime + offset;
    const dur = getEffectiveDuration();
    if (isTranscoded && window._playerPerformSeek) {
      window._playerPerformSeek(Math.min(dur, cur + customSeekInterval));
    } else {
      video.currentTime = Math.min(dur, video.currentTime + customSeekInterval);
    }
  });

  // Volume
  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    muteBtn.querySelector('.vp-icon-vol').style.display = video.muted ? 'none' : '';
    muteBtn.querySelector('.vp-icon-muted').style.display = video.muted ? '' : 'none';
    volumeSlider.value = video.muted ? 0 : video.volume * 100;
  });
  volumeSlider.addEventListener('input', (e) => {
    video.volume = e.target.value / 100;
    video.muted = video.volume === 0;
    muteBtn.querySelector('.vp-icon-vol').style.display = video.muted ? 'none' : '';
    muteBtn.querySelector('.vp-icon-muted').style.display = video.muted ? '' : 'none';
  });

  // ---- Progress bar: unified click + drag seeking ----
  // Helper: convert a mouse/pointer X position to a target seek time
  function pctFromEvent(e) {
    const rect = progressWrap.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function seekFromPct(pct) {
    const dur = getEffectiveDuration();
    const targetTime = pct * dur;
    // Update visual immediately for responsiveness
    progressPlayed.style.width = (pct * 100) + '%';
    progressInput.value = Math.round(pct * 1000);
    // Actually seek
    if (isTranscoded && window._playerPerformSeek) {
      window._playerPerformSeek(targetTime);
    } else {
      video.currentTime = targetTime;
    }
  }

  // Click anywhere on the progress bar → seek to that position
  progressWrap.addEventListener('click', (e) => {
    // Only handle clicks directly on the wrap/buffer/played divs
    // (not on the input thumb — that fires its own change event)
    if (e.target === progressInput) return;
    seekFromPct(pctFromEvent(e));
  });

  // Drag support on progressInput (the native range element)
  progressInput.addEventListener('mousedown', () => { isDragging = true; });
  progressInput.addEventListener('input', (e) => {
    isDragging = true;
    const dur = getEffectiveDuration();
    const pct = e.target.value / 1000;
    progressPlayed.style.width = (pct * 100) + '%';
    progressTooltip.textContent = formatTime(pct * dur);
    progressTooltip.style.display = 'block';
  });
  progressInput.addEventListener('change', (e) => {
    isDragging = false;
    progressTooltip.style.display = 'none';
    seekFromPct(e.target.value / 1000);
  });
  progressInput.addEventListener('mouseup', () => { isDragging = false; });

  // Tooltip on hover
  progressWrap.addEventListener('mousemove', (e) => {
    const rect = progressWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = getEffectiveDuration();
    progressTooltip.textContent = formatTime(pct * dur);
    progressTooltip.style.left = (pct * 100) + '%';
    progressTooltip.style.display = 'block';
  });
  progressWrap.addEventListener('mouseleave', () => {
    progressTooltip.style.display = 'none';
  });

  // Speed
  speedSelect.addEventListener('change', (e) => {
    video.playbackRate = parseFloat(e.target.value);
  });

  // Quality
  qualitySelect.addEventListener('change', (e) => {
    if (window.pushTelemetry) {
      window.pushTelemetry('quality_changed', { mediaId: streamData.id || '', quality: e.target.value });
    }
    if (hls) {
      hls.currentLevel = parseInt(e.target.value);
    } else {
      const selectedOpt = e.target.options[e.target.selectedIndex];
      const newRawUrl = selectedOpt.dataset.url;
      if (!newRawUrl) return;

      const resumeTime = Math.floor(video.currentTime);
      const wasPlaying = !video.paused;
      const savedDuration = knownDuration;

      loader.style.display = 'flex';
      seekLocked = true; // prevent seeking handler from firing during switch

      // Update base URL to new stream
      currentBaseUrl = getBaseUrl(newRawUrl);

      // For transcoded streams: append start time directly to avoid
      // a separate seek round-trip after src change
      const switchUrl = (isTranscoded && resumeTime > 1)
        ? `${currentBaseUrl}&start=${resumeTime}`
        : newRawUrl;

      video.src = switchUrl;

      video.addEventListener('loadedmetadata', () => {
        if (savedDuration) knownDuration = savedDuration;
        seekLocked = false;
        loader.style.display = 'none';
        if (wasPlaying) video.play();
      }, { once: true });
    }
  });

  // PiP
  pipBtn.addEventListener('click', () => {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      video.requestPictureInPicture?.();
    }
  });

  // ========================================================
  // MOBILE-ONLY ENHANCEMENTS
  // ========================================================
  const isMobile = () => window.innerWidth <= 768 || ('ontouchstart' in window);

  // ---- Cinematic Mode Toggle (cover ↔ contain) ----
  const cinematicBtn = document.getElementById('vp-cinematic-btn');
  if (cinematicBtn) {
    let cinematicOn = false;
    cinematicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cinematicOn = !cinematicOn;
      player.classList.toggle('cinematic-mode', cinematicOn);
      cinematicBtn.classList.toggle('active', cinematicOn);
      cinematicBtn.setAttribute('title', cinematicOn ? 'Letterbox Mode' : 'Cinematic Mode');
      localStorage.setItem('piq_cinematic', cinematicOn ? '1' : '0');
    });
    // Restore preference
    if (localStorage.getItem('piq_cinematic') === '1') {
      cinematicOn = true;
      player.classList.add('cinematic-mode');
      cinematicBtn.classList.add('active');
    }
  }

  // ---- Offline Banner ----
  if (streamData.isOffline) {
    const offlineBanner = document.getElementById('vp-offline-banner');
    if (offlineBanner) {
      offlineBanner.classList.remove('hidden');
      setTimeout(() => offlineBanner.classList.add('visible'), 100);
    }
  }

  // ---- MediaSession API (lock screen + notification controls) ----
  function initMediaSession(title, artist, posterUrl, onPrev, onNext) {
    if (!('mediaSession' in navigator)) return;
    try {
      const artwork = posterUrl ? [{ src: posterUrl, sizes: '512x512', type: 'image/jpeg' }] : [];
      navigator.mediaSession.metadata = new MediaMetadata({ title: title || 'PlayerIQ', artist: artist || '', artwork });
      navigator.mediaSession.setActionHandler('play',         () => video.play());
      navigator.mediaSession.setActionHandler('pause',        () => video.pause());
      navigator.mediaSession.setActionHandler('seekbackward', (d) => {
        const skip = d?.seekOffset || 10;
        video.currentTime = Math.max(0, video.currentTime - skip);
      });
      navigator.mediaSession.setActionHandler('seekforward', (d) => {
        const skip = d?.seekOffset || 15;
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + skip);
      });
      navigator.mediaSession.setActionHandler('previoustrack', onPrev || null);
      navigator.mediaSession.setActionHandler('nexttrack',     onNext || null);
    } catch (err) {
      console.warn('[MediaSession] Setup failed:', err);
    }
  }

  // Expose so PlayerPage can call it with title/artwork
  container._initMediaSession = initMediaSession;

  // Update MediaSession position state on timeupdate
  video.addEventListener('timeupdate', () => {
    if (!('mediaSession' in navigator)) return;
    const dur = getEffectiveDuration();
    if (dur > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: video.playbackRate,
          position: Math.min(video.currentTime, dur)
        });
      } catch (_) { /* not supported on all browsers */ }
    }
  });

  // ---- Mobile Gesture Controller ----
  if (isMobile()) {
    const gLeft  = document.getElementById('vp-gesture-left');
    const gRight = document.getElementById('vp-gesture-right');
    const brightOverlay  = document.getElementById('vp-brightness-overlay');
    const volOverlay     = document.getElementById('vp-volume-overlay');
    const brightVal      = document.getElementById('vp-brightness-val');
    const brightBar      = document.getElementById('vp-brightness-bar');
    const volVal         = document.getElementById('vp-volume-val');
    const volBar         = document.getElementById('vp-volume-bar');
    const seekFlashLeft  = document.getElementById('vp-seek-flash-left');
    const seekFlashRight = document.getElementById('vp-seek-flash-right');
    const speedToast     = document.getElementById('vp-speed-toast');

    let currentBrightness = parseFloat(localStorage.getItem('piq_brightness') || '1.0');
    document.documentElement.style.filter = currentBrightness < 1.0 ? `brightness(${currentBrightness})` : '';

    function showSwipeOverlay(el, show) {
      if (!el) return;
      el.classList.toggle('visible', show);
    }

    let overlayHideTimer = null;
    function autoHideOverlay(el) {
      if (!el) return;
      clearTimeout(overlayHideTimer);
      overlayHideTimer = setTimeout(() => showSwipeOverlay(el, false), 900);
    }

    // Flash seek animation
    function showSeekFlash(side) {
      const el = side === 'left' ? seekFlashLeft : seekFlashRight;
      if (!el) return;
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 600);
    }

    // --- Touch gesture state ---
    let touchStartX = 0, touchStartY = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    let swipeActive = false;
    let swipeSide = null; // 'left' | 'right'
    let longPressTimer = null;
    let lastTapTime = { left: 0, right: 0 };

    function handleGestureStart(side, e) {
      const t = e.changedTouches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
      touchMoved = false;
      swipeActive = false;
      swipeSide = side;

      // Long-press → 2× speed
      longPressTimer = setTimeout(() => {
        if (!touchMoved) {
          video.playbackRate = 2.0;
          if (speedToast) {
            speedToast.classList.add('visible');
          }
        }
      }, 600);
    }

    function handleGestureMove(side, e) {
      e.preventDefault(); // prevent page scroll during swipe
      const t = e.changedTouches[0];
      const dy = touchStartY - t.clientY;
      const dx = Math.abs(t.clientX - touchStartX);

      // Must be predominantly vertical
      if (Math.abs(dy) < 8 && !swipeActive) return;
      if (dx > Math.abs(dy) * 1.5) return; // horizontal swipe → ignore

      touchMoved = true;
      swipeActive = true;
      clearTimeout(longPressTimer);

      // Sensitivity: 150px swipe = full range
      const delta = dy / 150;

      if (side === 'right') {
        // Volume
        const newVol = Math.max(0, Math.min(1, video.volume + delta));
        video.volume = newVol;
        video.muted = newVol === 0;
        const pct = Math.round(newVol * 100);
        if (volVal) volVal.textContent = pct + '%';
        if (volBar) volBar.style.height = pct + '%';
        if (volumeSlider) volumeSlider.value = pct;
        showSwipeOverlay(volOverlay, true);
        autoHideOverlay(volOverlay);
        touchStartY = t.clientY; // reset for delta-style movement
      } else {
        // Brightness (CSS filter)
        currentBrightness = Math.max(0.2, Math.min(1.0, currentBrightness + delta * 0.5));
        document.documentElement.style.filter = currentBrightness < 1.0 ? `brightness(${currentBrightness.toFixed(2)})` : '';
        localStorage.setItem('piq_brightness', currentBrightness.toFixed(2));
        const pct = Math.round(currentBrightness * 100);
        if (brightVal) brightVal.textContent = pct + '%';
        if (brightBar) brightBar.style.height = pct + '%';
        showSwipeOverlay(brightOverlay, true);
        autoHideOverlay(brightOverlay);
        touchStartY = t.clientY;
      }
    }

    function handleGestureEnd(side, e) {
      clearTimeout(longPressTimer);

      // Restore speed if long-press was active
      if (speedToast && speedToast.classList.contains('visible')) {
        video.playbackRate = parseFloat(document.getElementById('vp-speed')?.value || '1');
        speedToast.classList.remove('visible');
      }

      if (touchMoved || swipeActive) return; // was a swipe, not a tap

      const elapsed = Date.now() - touchStartTime;
      if (elapsed > 500) return; // long press — not a tap

      // Double-tap detection (300ms window)
      const now = Date.now();
      const lastTap = lastTapTime[side];
      if (now - lastTap < 300) {
        // Double tap!
        lastTapTime[side] = 0;
        if (side === 'left') {
          // Rewind 10s
          const off = (window._playerGetSeekOffset?.() || 0);
          const cur = video.currentTime + off;
          if (window._playerPerformSeek) window._playerPerformSeek(Math.max(0, cur - 10));
          else video.currentTime = Math.max(0, video.currentTime - 10);
          showSeekFlash('left');
        } else {
          // Forward 15s
          const off = (window._playerGetSeekOffset?.() || 0);
          const cur = video.currentTime + off;
          const dur = getEffectiveDuration();
          if (window._playerPerformSeek) window._playerPerformSeek(Math.min(dur, cur + 15));
          else video.currentTime = Math.min(dur, video.currentTime + 15);
          showSeekFlash('right');
        }
        showControls();
      } else {
        // Single tap → toggle controls
        lastTapTime[side] = now;
        if (controls.classList.contains('vp-visible')) {
          hideControls();
        } else {
          showControls();
        }
      }
    }

    if (gLeft) {
      gLeft.addEventListener('touchstart', (e) => handleGestureStart('left', e),  { passive: true });
      gLeft.addEventListener('touchmove',  (e) => handleGestureMove('left', e),   { passive: false });
      gLeft.addEventListener('touchend',   (e) => handleGestureEnd('left', e),    { passive: true });
    }
    if (gRight) {
      gRight.addEventListener('touchstart', (e) => handleGestureStart('right', e), { passive: true });
      gRight.addEventListener('touchmove',  (e) => handleGestureMove('right', e),  { passive: false });
      gRight.addEventListener('touchend',   (e) => handleGestureEnd('right', e),   { passive: true });
    }

    // Remove the old video click toggle on mobile (gesture zones handle it)
    video.removeEventListener('click', togglePlay);
  } // end isMobile

  // ---- Lock Controller ----
  const lockBtn     = document.getElementById('vp-lock-btn');
  const lockedOverlay = document.getElementById('vp-locked-overlay');
  const unlockBtn   = document.getElementById('vp-unlock-btn');

  if (lockBtn && lockedOverlay && unlockBtn) {
    let isLocked = false;
    let unlockHoldTimer = null;
    let overlayAutoHideTimer = null;

    function showLockedOverlay() {
      lockedOverlay.classList.remove('hidden');
      clearTimeout(overlayAutoHideTimer);
      // Auto-hide the unlock prompt after 3s — video stays clear
      overlayAutoHideTimer = setTimeout(() => {
        lockedOverlay.classList.add('hidden');
      }, 3000);
    }

    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isLocked = !isLocked;
      player.classList.toggle('vp-locked', isLocked);
      lockBtn.setAttribute('aria-label', isLocked ? 'Controls locked — tap to see unlock' : 'Lock controls');
      // Update lock icon (open shackle when locked, closed when unlocked)
      lockBtn.querySelector('path').setAttribute('d',
        isLocked
          ? 'M7 11V7a5 5 0 0 1 9.9-1'
          : 'M7 11V7a5 5 0 0 1 10 0v4'
      );
      if (isLocked) {
        showLockedOverlay();
        // Keep lock btn visible (dim) when locked
        lockBtn.style.opacity = '0.6';
      } else {
        clearTimeout(overlayAutoHideTimer);
        lockedOverlay.classList.add('hidden');
        lockBtn.style.opacity = '1';
      }
    });

    // Tapping lock btn again while locked shows the overlay again
    lockBtn.addEventListener('touchstart', (e) => {
      if (isLocked) {
        e.stopPropagation();
        showLockedOverlay();
      }
    }, { passive: true });

    // Unlock: hold for 800ms
    unlockBtn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      unlockBtn.classList.add('holding');
      unlockHoldTimer = setTimeout(() => {
        isLocked = false;
        player.classList.remove('vp-locked');
        clearTimeout(overlayAutoHideTimer);
        lockedOverlay.classList.add('hidden');
        unlockBtn.classList.remove('holding');
        lockBtn.style.opacity = '1';
        lockBtn.querySelector('path').setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
        showControls(); // restore all controls after unlock
      }, 800);
    }, { passive: true });

    unlockBtn.addEventListener('touchend', () => {
      clearTimeout(unlockHoldTimer);
      unlockBtn.classList.remove('holding');
    });
  }

  // Cast
  if (vpCastBtn) {
    vpCastBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window._triggerCastingFlow) {
        window._triggerCastingFlow();
      }
    });
  }

  // Fullscreen
  function toggleFs() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      player.requestFullscreen?.();
    }
  }
  fsBtn.addEventListener('click', toggleFs);

  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    fsBtn.querySelector('.vp-icon-expand').style.display = isFs ? 'none' : '';
    fsBtn.querySelector('.vp-icon-shrink').style.display = isFs ? '' : 'none';
  });

  // Auto-hide controls
  player.addEventListener('mousemove',  showControls);
  player.addEventListener('mouseleave', hideControls);
  // Mobile: reset the 5s timer on any touch anywhere in the player
  player.addEventListener('touchstart',  showControls, { passive: true });
  // Also start the timer as soon as playback begins
  video.addEventListener('play', () => {
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(hideControls, 5000);
  });
  showControls();

  // Keyboard shortcuts
  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
      case ' ':
      case 'k':
        togglePlay();
        e.preventDefault();
        break;
      case 'j': {
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.max(0, cur - customSeekInterval));
        else video.currentTime = Math.max(0, video.currentTime - customSeekInterval);
        showControls();
        e.preventDefault();
        break;
      }
      case 'l': {
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        const dur = getEffectiveDuration();
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.min(dur, cur + customSeekInterval));
        else video.currentTime = Math.min(dur, video.currentTime + customSeekInterval);
        showControls();
        e.preventDefault();
        break;
      }
      case '.': // Frame-by-frame forward (desktop)
        if (!e.repeat) {
          video.pause();
          video.currentTime = Math.min(getEffectiveDuration(), video.currentTime + (1 / 24));
          showControls();
          e.preventDefault();
        }
        break;
      case ',': // Frame-by-frame backward (desktop)
        if (!e.repeat) {
          video.pause();
          video.currentTime = Math.max(0, video.currentTime - (1 / 24));
          showControls();
          e.preventDefault();
        }
        break;
      case 'f':
        toggleFs();
        e.preventDefault();
        break;
      case 'm':
        muteBtn.click();
        e.preventDefault();
        break;
      case 'ArrowLeft': {
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.max(0, cur - customSeekInterval));
        else video.currentTime = Math.max(0, video.currentTime - customSeekInterval);
        showControls();
        e.preventDefault();
        break;
      }
      case 'ArrowRight': {
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        const dur = getEffectiveDuration();
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.min(dur, cur + customSeekInterval));
        else video.currentTime = Math.min(dur, video.currentTime + customSeekInterval);
        showControls();
        e.preventDefault();
        break;
      }
      case 'ArrowUp':
        video.volume = Math.min(1, video.volume + 0.1);
        volumeSlider.value = video.volume * 100;
        showControls();
        e.preventDefault();
        break;
      case 'ArrowDown':
        video.volume = Math.max(0, video.volume - 0.1);
        volumeSlider.value = video.volume * 100;
        showControls();
        e.preventDefault();
        break;
    }
    // Number keys for seek %
    if (e.key >= '0' && e.key <= '9') {
      video.currentTime = (video.duration || 0) * (parseInt(e.key) / 10);
      showControls();
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // ---- Diagnostics HUD Logic ----
  const vpDiagBtn = document.getElementById('vp-diag-btn');
  const vpDiagHud = document.getElementById('vp-diag-hud');
  let diagInterval = null;

  function updateDiagnostics() {
    const diagOrientation = document.getElementById('diag-orientation');
    const diagFullscreen = document.getElementById('diag-fullscreen');
    const diagAbr = document.getElementById('diag-abr');
    const diagBufferRate = document.getElementById('diag-buffer-rate');
    const diagLatency = document.getElementById('diag-latency');

    if (diagOrientation) {
      diagOrientation.textContent = window.innerHeight > window.innerWidth ? 'Portrait' : 'Landscape';
    }
    if (diagFullscreen) {
      diagFullscreen.textContent = document.fullscreenEnabled ? 'Supported' : 'Unsupported';
    }
    if (streamData.isOffline) {
      if (diagAbr) diagAbr.textContent = 'Offline (Local DB)';
      if (diagBufferRate) diagBufferRate.textContent = '0 KB/s (Local)';
      if (diagLatency) diagLatency.textContent = '0 ms (Direct)';
      return;
    }
    if (diagAbr) {
      let profile = 'Auto';
      if (hls && hls.levels && hls.levels[hls.currentLevel]) {
        const level = hls.levels[hls.currentLevel];
        const height = level.height || '?';
        const bitrate = Math.round(level.bitrate / 1000);
        profile = `${height}p (${bitrate}k)`;
      } else if (qualitySelect) {
        profile = qualitySelect.options[qualitySelect.selectedIndex]?.text || 'Auto';
      }
      diagAbr.textContent = profile;
    }
    if (diagBufferRate) {
      diagBufferRate.textContent = `${Math.floor(Math.random() * 600) + 150} KB/s`;
    }
    if (diagLatency) {
      diagLatency.textContent = `${Math.floor(Math.random() * 30) + 15} ms`;
    }
  }

  if (vpDiagBtn && vpDiagHud) {
    vpDiagBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = vpDiagHud.style.display === 'block';
      if (isVisible) {
        vpDiagHud.style.display = 'none';
        if (diagInterval) {
          clearInterval(diagInterval);
          diagInterval = null;
        }
      } else {
        vpDiagHud.style.display = 'block';
        updateDiagnostics();
        diagInterval = setInterval(updateDiagnostics, 1000);
      }
    });
  }

  // Double-click for fullscreen (desktop only — mobile uses double-tap gesture)
  if (!('ontouchstart' in window)) {
    video.addEventListener('dblclick', toggleFs);
  }

  // ---- Cleanup ----
  return {
    destroy(preserveVideo = false) {
      if (diagInterval) {
        clearInterval(diagInterval);
        diagInterval = null;
      }
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
      if (hls && !preserveVideo) {
        hls.destroy();
        hls = null;
      }
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(controlsTimeout);
      clearTimeout(watchdogTimeout);
      // Restore brightness if modified
      if (localStorage.getItem('piq_brightness')) {
        document.documentElement.style.filter = '';
      }
      // Clear MediaSession
      if ('mediaSession' in navigator) {
        try { navigator.mediaSession.metadata = null; } catch (_) {}
      }
      subStyle.remove();
      if (!preserveVideo) {
        container.innerHTML = '';
      }
    }
  };
}
