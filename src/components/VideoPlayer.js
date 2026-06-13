// ========================================
// PlayerIQ — Custom Video Player (HLS.js)
// ========================================

import { NODE_PROXY } from '../services/api.js';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import Hls from 'hls.js';

/**
 * Renders a custom HTML5 video player with full controls
 * @param {HTMLElement} container - The wrapper element
 * @param {Object} streamData - { url, type, subtitles, provider }
 * @param {Object} options - { onProgress, onFatalError, onEnded, startTime, existingVideo }
 * @returns {{ destroy: Function }} cleanup handle
 */
export function createVideoPlayer(container, streamData, {
  onProgress = null,
  onFatalError = null,
  onEnded = null,
  startTime = 0,
  existingVideo = null,
  episodes = [],
  currentSeason = 1,
  currentEpisode = 1,
  goToEpisode = null
} = {}) {
  let hls = null;
  let controlsTimeout = null;
  let isDragging = false;
  let playInterval = null;
  let isEpisodesVisible = false; // Tracks if Episodes Overlay is open


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
      <video class="vp-video" id="vp-video" playsinline crossorigin="anonymous" disableRemotePlayback disablePictureInPicture></video>

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
        <!-- Flanking time labels (mobile only) -->
        <span class="vp-time-current" id="vp-time-current">0:00</span>
        <span class="vp-time-total" id="vp-time-total">0:00</span>

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

            <div class="vp-subtitles-desktop-wrapper" id="vp-subtitles-desktop-wrapper" style="display: flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;opacity:0.8;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="15" y2="13"/></svg>
              <select class="vp-select" id="vp-subtitles" title="Subtitles" aria-label="Video Subtitles">
                <option value="off" selected>Off</option>
              </select>
            </div>

            <button class="vp-btn" id="vp-sub-settings-btn" title="Subtitle Settings" aria-label="Subtitle Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
            </button>

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
        <span class="vp-seek-label">‹‹ 30s</span>
      </div>

      <!-- Double-tap seek flash — right (forward) -->
      <div id="vp-seek-flash-right" class="vp-seek-flash vp-seek-flash-right" aria-hidden="true">
        <div class="vp-seek-arrows">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13 7 22 12 13 17 13 7"/><polygon points="2 7 11 12 2 17 2 7"/></svg>
        </div>
        <span class="vp-seek-label">30s ››</span>
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
        <div class="vp-locked-hint">Hold 2s to unlock</div>
        <button id="vp-unlock-btn" class="vp-unlock-btn" aria-label="Hold to unlock controls">
          <!-- Circular progress overlay -->
          <svg class="vp-unlock-circle" viewBox="0 0 100 100">
            <circle class="vp-unlock-circle-bg" cx="50" cy="50" r="44"></circle>
            <circle id="vp-unlock-circle-bar" class="vp-unlock-circle-bar" cx="50" cy="50" r="44"></circle>
          </svg>
          <!-- Center padlock icon -->
          <svg class="vp-unlock-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;z-index:2;position:relative;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
          </svg>
        </button>
      </div>

      <!-- Custom Dialog Overlay (Netflix-style for Speed/Quality) -->
      <div id="vp-custom-dialog" class="vp-custom-dialog hidden">
        <div class="vp-dialog-backdrop" id="vp-dialog-backdrop"></div>
        <div class="vp-dialog-card">
          <h3 class="vp-dialog-title">Playback Speed</h3>
          <div class="vp-dialog-options-list" id="vp-dialog-options-list"></div>
          <div class="vp-dialog-footer">
            <button class="vp-dialog-cancel-btn" id="vp-dialog-cancel-btn">CANCEL</button>
          </div>
        </div>
      </div>

      <!-- Episodes List Overlay -->
      <div id="vp-episodes-overlay" class="vp-episodes-overlay hidden">
        <div class="vp-episodes-header">
          <h3 class="vp-episodes-overlay-title">Episodes</h3>
          <button class="vp-episodes-close-btn" id="vp-episodes-close-btn" aria-label="Close Episodes list">✕</button>
        </div>
        <div class="vp-episodes-carousel-wrapper">
          <button class="vp-episodes-arrow left" id="vp-episodes-arrow-left" aria-label="Scroll left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="vp-episodes-carousel" id="vp-episodes-carousel">
            <!-- Cards rendered dynamically -->
          </div>
          <button class="vp-episodes-arrow right" id="vp-episodes-arrow-right" aria-label="Scroll right">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      <!-- Dynamic subtitle nudge layer — positioned via JS/CSS when controls show -->
      <div id="vp-subtitle-nudge" class="vp-subtitle-nudge"></div>

      <!-- Subtitle Settings Backdrop (Mobile Centered Dialog) -->
      <div id="vp-sub-backdrop" class="vp-sub-backdrop hidden"></div>

      <!-- Subtitle Style Settings Panel -->
      <div id="vp-sub-settings-panel" class="vp-sub-settings-panel hidden">
        <div class="vp-ssp-header">
          <span class="vp-ssp-title">Subtitle Style</span>
          <button class="vp-ssp-close" id="vp-ssp-close" aria-label="Close subtitle settings">&#x2715;</button>
        </div>
        <div class="vp-ssp-row">
          <label class="vp-ssp-label">Font Size</label>
          <div class="vp-ssp-slider-wrap">
            <input type="range" class="vp-ssp-slider" id="vp-ssp-size" min="60" max="200" step="10" value="100" aria-label="Subtitle font size">
            <span class="vp-ssp-val" id="vp-ssp-size-val">100%</span>
          </div>
        </div>
        <div class="vp-ssp-row">
          <label class="vp-ssp-label">Text Color</label>
          <div class="vp-ssp-swatches" id="vp-ssp-swatches">
            <button class="vp-ssp-swatch active" data-color="#ffffff" style="background:#ffffff" aria-label="White"></button>
            <button class="vp-ssp-swatch" data-color="#ffff00" style="background:#ffff00" aria-label="Yellow"></button>
            <button class="vp-ssp-swatch" data-color="#00ffff" style="background:#00ffff" aria-label="Cyan"></button>
            <button class="vp-ssp-swatch" data-color="#00ff88" style="background:#00ff88" aria-label="Green"></button>
            <button class="vp-ssp-swatch" data-color="#ff8c00" style="background:#ff8c00" aria-label="Orange"></button>
          </div>
        </div>
        <div class="vp-ssp-row">
          <label class="vp-ssp-label">Background Opacity</label>
          <div class="vp-ssp-slider-wrap">
            <input type="range" class="vp-ssp-slider" id="vp-ssp-bg" min="0" max="100" step="5" value="50" aria-label="Subtitle background opacity">
            <span class="vp-ssp-val" id="vp-ssp-bg-val">50%</span>
          </div>
        </div>
        <div class="vp-ssp-row">
          <label class="vp-ssp-label">Position</label>
          <div class="vp-ssp-toggle-group">
            <button class="vp-ssp-toggle active" data-pos="normal">Default</button>
            <button class="vp-ssp-toggle" data-pos="raised">Raised</button>
          </div>
        </div>
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

  // NATIVE CAPACITOR APP: Allow rotation while video player is open
  if (Capacitor && Capacitor.isNativePlatform()) {
    try { ScreenOrientation.unlock().catch(() => {}); } catch(e) {}
  }

  // ---- Elements ----
  const player = document.getElementById('vp-player');
  const video = existingVideo || document.getElementById('vp-video');

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
  if (controls && !document.getElementById('vp-top-title')) {
    // Floating title overlay — flex row: [Left Controls: Back, Cast, Sub Settings] [Title] [Fullscreen]
    // No strip background, just text+buttons floating over a top gradient
    const titleOverlay = document.createElement('div');
    titleOverlay.className = 'vp-top-title-overlay';
    titleOverlay.id = 'vp-top-title';
    titleOverlay.innerHTML = `
      <div class="vp-top-left-group">
        <!-- Back button — pill with left arrow -->
        <button class="vp-btn vp-overlay-btn vp-top-back" id="vp-top-back-btn" title="Back" aria-label="Go Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>

        <!-- Cast + Subtitle Settings — joined pill group -->
        <div class="vp-overlay-pill-group">
          <button class="vp-btn vp-overlay-btn vp-pill-left" id="vp-top-cast-btn" title="Cast Video" aria-label="Cast Video">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 8.95 20M2 8A13 13 0 0 1 13.99 20M2 20h.01"></path><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"></rect></svg>
          </button>
          <div class="vp-pill-divider"></div>
          <button class="vp-btn vp-overlay-btn vp-pill-right" id="vp-top-sub-settings-btn" title="Subtitle Settings" aria-label="Subtitle Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          </button>
        </div>
      </div>

      <!-- Center title -->
      <div class="vp-top-title-center">
        <span class="vp-title-text" id="vp-title-text">Now Playing</span>
        <span class="vp-title-ep-badge" id="vp-title-ep-badge" style="display:none"></span>
      </div>

      <!-- Fullscreen button — right -->
      <button class="vp-btn vp-overlay-btn vp-top-fs-circle" id="vp-top-fs-btn" title="Fullscreen" aria-label="Toggle Fullscreen">
        <svg class="vp-top-fs-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        <svg class="vp-top-fs-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
    `;
    player.appendChild(titleOverlay);

    // Wire overlay buttons
    const _topBack = document.getElementById('vp-top-back-btn');
    if (_topBack) {
      _topBack.addEventListener('click', e => {
        e.stopPropagation();
        if (window.history.length > 1) window.history.back();
        else window.location.hash = '#/';
      });
    }
    const _topCast = document.getElementById('vp-top-cast-btn');
    if (_topCast) {
      _topCast.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('vp-cast-btn')?.click();
      });
    }
    const _topSubSettings = document.getElementById('vp-top-sub-settings-btn');
    if (_topSubSettings) {
      _topSubSettings.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('vp-sub-settings-btn')?.click();
      });
    }
    const _topFs   = document.getElementById('vp-top-fs-btn');
    if (_topFs) {
      _topFs.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('vp-fs-btn')?.click();
      });
    }

    // 2. Brightness Slider Group
    const brightSlider = document.createElement('div');
    brightSlider.className = 'vp-brightness-slider-group';
    brightSlider.id = 'vp-brightness-slider-group';
    brightSlider.innerHTML = `
      <svg class="vp-brightness-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <div class="vp-brightness-slider-track">
        <input type="range" class="vp-brightness-slider-input" id="vp-brightness-slider" min="10" max="100" value="80" aria-label="Brightness slider">
        <div class="vp-brightness-slider-fill" id="vp-brightness-slider-fill" style="height: 80%;"></div>
      </div>
    `;
    controls.appendChild(brightSlider);

    // 3. Netflix-style bottom options row
    const isTvShow = streamData.isTV === true || streamData.isTV === 'true';
    const optionsRow = document.createElement('div');
    optionsRow.className = 'vp-mobile-options-row';
    optionsRow.id = 'vp-mobile-options-row';
    optionsRow.innerHTML = `
      <!-- Speed option: transparent select sits on top -->
      <div class="vp-mobile-opt" id="vp-opt-speed">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a10 10 0 1 1-6.88 17.24"/><path d="M12 6v6l4 2"/>
        </svg>
        <span class="vp-opt-text" id="vp-opt-speed-label">Speed (1x)</span>
      </div>
      <!-- Lock option -->
      <div class="vp-mobile-opt" id="vp-opt-lock">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span class="vp-opt-text">Lock</span>
      </div>
      <!-- Episodes / Related option (always visible for movies, dynamic for TV) -->
      <div class="vp-mobile-opt" id="vp-opt-episodes" style="${isTvShow ? 'display:none' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        <span class="vp-opt-text" id="vp-opt-episodes-label">${isTvShow ? 'Episodes' : 'Related'}</span>
      </div>
      <!-- Subtitles option -->
      <div class="vp-mobile-opt" id="vp-opt-subtitles">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="7" y1="9" x2="17" y2="9"/>
          <line x1="7" y1="13" x2="15" y2="13"/>
        </svg>
        <span class="vp-opt-text" id="vp-opt-subtitles-label">Subtitles</span>
      </div>
      <!-- Audio & Quality option: transparent select sits on top -->
      <div class="vp-mobile-opt" id="vp-opt-quality">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="vp-opt-text">Quality</span>
      </div>
      <!-- Next Episode / Watch Next option (hidden by default, shown dynamically) -->
      <div class="vp-mobile-opt" id="vp-opt-next" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
        </svg>
        <span class="vp-opt-text" id="vp-opt-next-label">${isTvShow ? 'Next Episode' : 'Watch Next'}</span>
      </div>
    `;
    controls.appendChild(optionsRow);

    // Wire up listeners
    const bSlider = document.getElementById('vp-brightness-slider');
    const bSliderFill = document.getElementById('vp-brightness-slider-fill');

    const optSpeed = document.getElementById('vp-opt-speed');
    const optSpeedLabel = document.getElementById('vp-opt-speed-label');
    const optLock = document.getElementById('vp-opt-lock');
    const optEpisodes = document.getElementById('vp-opt-episodes');
    const optEpisodesLabel = document.getElementById('vp-opt-episodes-label');
    const optQuality = document.getElementById('vp-opt-quality');
    const optSubtitles = document.getElementById('vp-opt-subtitles');
    const optSubtitlesLabel = document.getElementById('vp-opt-subtitles-label');
    const optNext = document.getElementById('vp-opt-next');
    const optNextLabel = document.getElementById('vp-opt-next-label');

    let currentBrightness = parseFloat(localStorage.getItem('piq_brightness') || '1.0');
    if (bSlider && bSliderFill) {
      const initialPct = Math.round(currentBrightness * 100);
      bSlider.value = initialPct;
      bSliderFill.style.height = initialPct + '%';

      bSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        const bounded = Math.max(0.1, Math.min(1.0, val));
        document.documentElement.style.filter = bounded < 1.0 ? `brightness(${bounded.toFixed(2)})` : '';
        localStorage.setItem('piq_brightness', bounded.toFixed(2));
      });
    }


    // Lock option: forwards tap to real lock button
    if (optLock) {
      optLock.addEventListener('click', (e) => {
        e.stopPropagation();
        const realLockBtn = document.getElementById('vp-lock-btn');
        if (realLockBtn) realLockBtn.click();
      });
    }

    // Custom Netflix-Style Picker
    const customDialog = document.getElementById('vp-custom-dialog');
    const dialogBackdrop = document.getElementById('vp-dialog-backdrop');
    const dialogOptionsList = document.getElementById('vp-dialog-options-list');
    const dialogCancelBtn = document.getElementById('vp-dialog-cancel-btn');

    function openCustomPicker(title, nativeSelect) {
      if (!customDialog || !dialogOptionsList) return;

      const titleEl = customDialog.querySelector('.vp-dialog-title');
      if (titleEl) titleEl.textContent = title;

      dialogOptionsList.innerHTML = '';
      const options = Array.from(nativeSelect.options);

      options.forEach(opt => {
        const isSelected = opt.value === nativeSelect.value;
        const optItem = document.createElement('div');
        optItem.className = `vp-dialog-option ${isSelected ? 'selected' : ''}`;
        optItem.dataset.value = opt.value;

        // Custom Radio Circular indicator
        const radio = document.createElement('span');
        radio.className = `vp-dialog-radio ${isSelected ? 'checked' : ''}`;
        radio.innerHTML = `<span class="vp-dialog-radio-inner"></span>`;

        const label = document.createElement('span');
        label.className = 'vp-dialog-option-label';
        
        let labelText = opt.textContent || opt.text;
        if (title.toLowerCase().includes('speed') && opt.value === '1') {
          labelText = '1x (Normal)';
        }
        label.textContent = labelText;

        optItem.appendChild(radio);
        optItem.appendChild(label);

        optItem.addEventListener('click', () => {
          nativeSelect.value = opt.value;
          nativeSelect.dispatchEvent(new Event('change'));
          closeCustomPicker();
        });

        dialogOptionsList.appendChild(optItem);
      });

      customDialog.classList.remove('hidden');
      customDialog.classList.add('visible');

      // Clear any active controls timeout to prevent controls hiding while modal is open
      clearTimeout(controlsTimeout);
    }

    function closeCustomPicker() {
      if (customDialog) {
        customDialog.classList.remove('visible');
        customDialog.classList.add('hidden');
      }
      showControls();
    }

    if (dialogCancelBtn) {
      dialogCancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCustomPicker();
      });
    }

    if (dialogBackdrop) {
      dialogBackdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCustomPicker();
      });
    }

    // Speed option: Custom centered picker
    if (optSpeed) {
      const realSpeed = document.getElementById('vp-speed');
      if (realSpeed) {
        // Sync initial speed label
        if (optSpeedLabel) optSpeedLabel.textContent = `Speed (${realSpeed.value}x)`;
        
        // Update label on change
        realSpeed.addEventListener('change', () => {
          const val = parseFloat(realSpeed.value);
          if (optSpeedLabel) optSpeedLabel.textContent = `Speed (${val}x)`;
        });

        optSpeed.addEventListener('click', (e) => {
          e.stopPropagation();
          openCustomPicker('Playback Speed', realSpeed);
        });
      }
    }

    // Quality option: Custom centered picker
    if (optQuality) {
      const realQuality = document.getElementById('vp-quality');
      const optQualityLabel = optQuality.querySelector('.vp-opt-text') || document.getElementById('vp-opt-quality-label');
      if (realQuality) {
        const updateQualityLabel = () => {
          if (optQualityLabel) {
            const selectedText = realQuality.options[realQuality.selectedIndex]?.text || 'Quality';
            // Show short form e.g. "1080p" instead of full text like "1080p (3708k)"
            const cleanText = selectedText.split(' ')[0] || 'Quality';
            optQualityLabel.textContent = cleanText;
          }
        };

        // Sync initial label
        updateQualityLabel();

        // Update label on change
        realQuality.addEventListener('change', updateQualityLabel);

        // Sync when option list changes dynamically (HLS stream loading)
        const qualityObserver = new MutationObserver(updateQualityLabel);
        qualityObserver.observe(realQuality, { childList: true, subtree: true });

        optQuality.addEventListener('click', (e) => {
           e.stopPropagation();
           openCustomPicker('Video Quality', realQuality);
         });
       }
     }

     // Subtitles option logic (Desktop Dropdown & Mobile Picker)
     const realSubtitles = document.getElementById('vp-subtitles');
     if (realSubtitles) {
       // Active cue listener refs — cleaned up on each track switch
       let _cueTrack = null;
       let _cueHandler = null;

       function toggleSubtitleTrack(trackIndex) {
         const tracks = video.textTracks;
         if (!tracks) return;
         const nudge = document.getElementById('vp-subtitle-nudge');

         // Remove previous cue listener + disable all tracks
         if (_cueTrack && _cueHandler) {
           _cueTrack.removeEventListener('cuechange', _cueHandler);
           _cueTrack = null; _cueHandler = null;
         }
         Array.from(tracks).forEach(t => { t.mode = 'disabled'; });
         if (nudge) nudge.innerHTML = '';

         localStorage.setItem('piq_sub_preference', trackIndex === -1 ? 'off' : String(trackIndex));

         // Update mobile opt label text dynamically
         if (optSubtitlesLabel) {
           optSubtitlesLabel.textContent = trackIndex === -1
             ? 'Subtitles (Off)'
             : (streamData.subtitles?.[trackIndex]?.label || `Subtitle ${trackIndex + 1}`);
         }

         if (trackIndex === -1) return; // Off — nothing more to do

         const targetTrack = Array.from(tracks)[trackIndex];
         if (!targetTrack) return;

         // 'hidden' = browser loads/parses cues but does NOT render them natively.
         // We render into #vp-subtitle-nudge so we can fully control position.
         targetTrack.mode = 'hidden';
         _cueTrack = targetTrack;

         _cueHandler = () => {
           if (!nudge) return;
           const activeCues = targetTrack.activeCues;
           if (!activeCues || activeCues.length === 0) { nudge.innerHTML = ''; return; }
           const texts = Array.from(activeCues).map(c =>
             (c.text || '').replace(/<[^>]+>/g, '') // strip any embedded HTML tags
           );
           const sz  = localStorage.getItem('piq_sub_size') || '100%';
           const col = localStorage.getItem('piq_sub_color') || '#ffffff';
           const bg  = localStorage.getItem('piq_sub_bg_opacity') || '0.5';
           nudge.innerHTML = `<span class="vp-cue-text" style="font-size:${sz};color:${col};background-color:rgba(0,0,0,${bg})">${texts.join('<br>')}</span>`;
         };

         targetTrack.addEventListener('cuechange', _cueHandler);
       }

       // Populates subtitles dynamically in the select element
       const setupSubtitles = () => {
         if (streamData.subtitles?.length) {
           realSubtitles.innerHTML = '<option value="off">Off</option>';
           streamData.subtitles.forEach((sub, i) => {
             realSubtitles.innerHTML += `<option value="${i}">${sub.label || `Subtitle ${i + 1}`}</option>`;
           });

           // Apply default or saved user preference
           const savedSubPref = localStorage.getItem('piq_sub_preference');
           if (savedSubPref !== null) {
             if (savedSubPref === 'off') {
               realSubtitles.value = 'off';
               toggleSubtitleTrack(-1);
             } else {
               const prefIdx = parseInt(savedSubPref);
               if (!isNaN(prefIdx) && prefIdx < streamData.subtitles.length) {
                 realSubtitles.value = savedSubPref;
                 toggleSubtitleTrack(prefIdx);
               } else {
                 realSubtitles.value = 'off';
                 toggleSubtitleTrack(-1);
               }
             }
           } else {
             // Default to index 0 (typically English) if available
             realSubtitles.value = '0';
             toggleSubtitleTrack(0);
           }
         } else {
           // Hide UI controls if no subtitles are available
           const desktopWrapper = document.getElementById('vp-subtitles-desktop-wrapper');
           if (desktopWrapper) desktopWrapper.style.display = 'none';
           if (optSubtitles) optSubtitles.style.display = 'none';
         }
       };

       setupSubtitles();

       // Bind change listener for desktop selector
       realSubtitles.addEventListener('change', (e) => {
         const val = e.target.value;
         toggleSubtitleTrack(val === 'off' ? -1 : parseInt(val));
       });

       // Bind mobile picker trigger
       if (optSubtitles) {
         optSubtitles.addEventListener('click', (e) => {
           e.stopPropagation();
           openCustomPicker('Subtitles', realSubtitles);
         });
       }

       // Ensure tracks are synchronized if they are lazy loaded by the browser
       video.textTracks.addEventListener('addtrack', () => {
         const savedSubPref = localStorage.getItem('piq_sub_preference');
         const activeIdx = (savedSubPref === 'off' || savedSubPref === null) ? -1 : parseInt(savedSubPref);
          toggleSubtitleTrack(activeIdx === -1 ? (streamData.subtitles?.length ? 0 : -1) : activeIdx);
        });
      }


    // ── Subtitle Style Settings Panel ─────────────────────────────────────
    const subSettingsBtn   = document.getElementById('vp-sub-settings-btn');
    const subSettingsPanel = document.getElementById('vp-sub-settings-panel');
    const subBackdrop      = document.getElementById('vp-sub-backdrop');

    if (subSettingsBtn && subSettingsPanel) {
      const sspClose   = document.getElementById('vp-ssp-close');
      const sspSize    = document.getElementById('vp-ssp-size');
      const sspSizeVal = document.getElementById('vp-ssp-size-val');
      const sspBg      = document.getElementById('vp-ssp-bg');
      const sspBgVal   = document.getElementById('vp-ssp-bg-val');
      const sspSwatches = subSettingsPanel.querySelectorAll('.vp-ssp-swatch');
      const sspPosBtns  = subSettingsPanel.querySelectorAll('.vp-ssp-toggle');

      // Init current values from localStorage
      let curSize    = parseInt(localStorage.getItem('piq_sub_size') || '100') || 100;
      let curColor   = localStorage.getItem('piq_sub_color') || '#ffffff';
      let curBgOpPct = Math.round(parseFloat(localStorage.getItem('piq_sub_bg_opacity') || '0.5') * 100);
      let curPos     = localStorage.getItem('piq_sub_position') || 'normal';

      if (sspSize)    { sspSize.value = curSize; }
      if (sspSizeVal) { sspSizeVal.textContent = curSize + '%'; }
      if (sspBg)      { sspBg.value = curBgOpPct; }
      if (sspBgVal)   { sspBgVal.textContent = curBgOpPct + '%'; }

      // Highlight matching color swatch
      sspSwatches.forEach(s => {
        s.classList.toggle('active', s.dataset.color.toLowerCase() === curColor.toLowerCase());
      });
      // Highlight matching position toggle
      sspPosBtns.forEach(b => b.classList.toggle('active', b.dataset.pos === curPos));
      // Apply saved position class to nudge
      const nudgeEl = document.getElementById('vp-subtitle-nudge');
      if (nudgeEl && curPos === 'raised') nudgeEl.classList.add('position-raised');

      // ── Live-update helper ──────────────────────────────────────────────
      function applySubStylesLive(size, color, bgOpPct) {
        // Update ::cue style tag (for any browser-native fallback)
        const styleEl = document.getElementById('piq-subtitles-custom-style');
        if (styleEl) {
          styleEl.innerHTML = `#vp-video::cue{font-size:${size}% !important;color:${color} !important;background-color:rgba(0,0,0,${bgOpPct/100}) !important;}`;
        }
        // Also update the already-rendered cue span instantly
        const el = document.querySelector('#vp-subtitle-nudge .vp-cue-text');
        if (el) {
          el.style.fontSize   = size + '%';
          el.style.color      = color;
          el.style.backgroundColor = `rgba(0,0,0,${bgOpPct/100})`;
        }
        // Persist
        localStorage.setItem('piq_sub_size',       size + '%');
        localStorage.setItem('piq_sub_color',      color);
        localStorage.setItem('piq_sub_bg_opacity', String(bgOpPct / 100));
      }

      // ── Open / Close ────────────────────────────────────────────────────
      let _panelOpen = false;
      function openSubPanel() {
        subSettingsPanel.classList.remove('hidden');
        requestAnimationFrame(() => subSettingsPanel.classList.add('open'));
        if (subBackdrop) {
          subBackdrop.classList.remove('hidden');
          requestAnimationFrame(() => subBackdrop.classList.add('open'));
        }
        subSettingsBtn.classList.add('active');
        _panelOpen = true;
        clearTimeout(controlsTimeout); // keep controls alive while panel is open
      }
      function closeSubPanel() {
        subSettingsPanel.classList.remove('open');
        setTimeout(() => subSettingsPanel.classList.add('hidden'), 300);
        if (subBackdrop) {
          subBackdrop.classList.remove('open');
          setTimeout(() => subBackdrop.classList.add('hidden'), 300);
        }
        subSettingsBtn.classList.remove('active');
        _panelOpen = false;
      }

      subSettingsBtn.addEventListener('click', e => {
        e.stopPropagation();
        _panelOpen ? closeSubPanel() : openSubPanel();
      });
      if (sspClose) {
        sspClose.addEventListener('click', e => { e.stopPropagation(); closeSubPanel(); });
      }
      if (subBackdrop) {
        subBackdrop.addEventListener('click', e => {
          e.stopPropagation();
          closeSubPanel();
        });
      }

      // ── Size slider ─────────────────────────────────────────────────────
      if (sspSize) {
        sspSize.addEventListener('input', e => {
          curSize = parseInt(e.target.value);
          if (sspSizeVal) sspSizeVal.textContent = curSize + '%';
          applySubStylesLive(curSize, curColor, curBgOpPct);
        });
      }

      // ── Color swatches ──────────────────────────────────────────────────
      sspSwatches.forEach(swatch => {
        swatch.addEventListener('click', e => {
          e.stopPropagation();
          curColor = swatch.dataset.color;
          sspSwatches.forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
          applySubStylesLive(curSize, curColor, curBgOpPct);
        });
      });

      // ── Background opacity ──────────────────────────────────────────────
      if (sspBg) {
        sspBg.addEventListener('input', e => {
          curBgOpPct = parseInt(e.target.value);
          if (sspBgVal) sspBgVal.textContent = curBgOpPct + '%';
          applySubStylesLive(curSize, curColor, curBgOpPct);
        });
      }

      // ── Position toggle ─────────────────────────────────────────────────
      sspPosBtns.forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          curPos = btn.dataset.pos;
          sspPosBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          localStorage.setItem('piq_sub_position', curPos);
          const nudge2 = document.getElementById('vp-subtitle-nudge');
          if (nudge2) nudge2.classList.toggle('position-raised', curPos === 'raised');
        });
      });

      // Close panel on outside-click
      player.addEventListener('click', e => {
        if (_panelOpen && !subSettingsPanel.contains(e.target) && e.target !== subSettingsBtn) {
          closeSubPanel();
        }
      });

      // Mirror hide — if no subtitles, hide settings button too
      const desktopWrapper = document.getElementById('vp-subtitles-desktop-wrapper');
      if (desktopWrapper && desktopWrapper.style.display === 'none') {
        subSettingsBtn.style.display = 'none';
      }
    }


    function renderEpisodeCards() {
      const carousel = document.getElementById('vp-episodes-carousel');
      if (!carousel || !episodes || episodes.length === 0) return;

      carousel.innerHTML = episodes.map(ep => {
        const isCurrent = ep.episode_number === currentEpisode;
        
        let thumbUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60"%3E%3Crect width="100%" height="100%" fill="%23141418"/%3E%3Ccircle cx="50" cy="30" r="10" fill="%23a855f7" opacity="0.3"/%3E%3C/svg%3E';
        if (ep.still_path) {
          thumbUrl = `https://image.tmdb.org/t/p/w300${ep.still_path}`;
        } else if (streamData.backdrop) {
          thumbUrl = `https://image.tmdb.org/t/p/w300${streamData.backdrop}`;
        } else if (streamData.poster) {
          thumbUrl = `https://image.tmdb.org/t/p/w300${streamData.poster}`;
        }

        const titleText = ep.name || `Episode ${ep.episode_number}`;
        const runtimeText = ep.runtime ? `${ep.runtime} min` : '';

        const progressPct = ep.progress || 0;
        const progressBarHTML = progressPct > 0 ? `
          <div class="vp-episode-progress-wrap">
            <div class="vp-episode-progress-fill" style="width: ${progressPct}%;"></div>
          </div>
        ` : '';

        return `
          <div class="vp-episode-card ${isCurrent ? 'active' : ''}" 
               data-episode="${ep.episode_number}" 
               data-season="${currentSeason}"
               tabindex="0"
               role="button"
               aria-label="Episode ${ep.episode_number}: ${titleText}. ${runtimeText}">
            <div class="vp-episode-thumb-wrapper">
              <img class="vp-episode-thumb" src="${thumbUrl}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\x22http://www.w3.org/2000/svg\x22 width=\x22100\x22 height=\x2260\x22 viewBox=\x220 0 100 60\x22%3E%3Crect width=\x22100%25\x22 height=\x22100%25\x22 fill=\x22%23141418\x22/%3E%3C/svg%3E'" />
              ${runtimeText ? `<span class="vp-episode-duration">${runtimeText}</span>` : ''}
              ${progressBarHTML}
            </div>
            <div class="vp-episode-details">
              <div class="vp-episode-meta">
                <span class="vp-episode-num">E${ep.episode_number}</span>
                <span class="vp-episode-title-text">${titleText}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      carousel.querySelectorAll('.vp-episode-card').forEach(card => {
        card.addEventListener('click', () => {
          const epNum = parseInt(card.dataset.episode);
          const sNum = parseInt(card.dataset.season);
          if (goToEpisode) {
            isEpisodesVisible = false;
            toggleEpisodesOverlay(false);
            goToEpisode(sNum, epNum);
          }
        });
      });
    }

    function toggleEpisodesOverlay(visible) {
      const overlay = document.getElementById('vp-episodes-overlay');
      if (!overlay) return;

      if (visible) {
        // Hide other custom picker dialogs if they are open
        closeCustomPicker();
        
        overlay.classList.remove('hidden');
        overlay.classList.add('vp-visible');
        optEpisodes.classList.add('selected');
        
        renderEpisodeCards();

        // Scroll active episode into view
        const activeCard = overlay.querySelector('.vp-episode-card.active');
        if (activeCard) {
          setTimeout(() => {
            activeCard.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
          }, 150);
        }

        clearTimeout(controlsTimeout);
      } else {
        overlay.classList.remove('vp-visible');
        overlay.classList.add('hidden');
        optEpisodes.classList.remove('selected');
        showControls();
      }
    }

    // Episodes / Related option toggle
    if (optEpisodes) {
      optEpisodes.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isTvShow && episodes && episodes.length > 0) {
          isEpisodesVisible = !isEpisodesVisible;
          toggleEpisodesOverlay(isEpisodesVisible);
        } else {
          // Fallback Related items behavior for movies
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
          setTimeout(() => {
            const epSection = document.querySelector('.mobile-player-section') || document.querySelector('.mobile-player-episodes-section') || document.querySelector('.player-related');
            if (epSection) epSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 200);
        }
      });
    }

    // Close button overlay click
    const epCloseBtn = document.getElementById('vp-episodes-close-btn');
    if (epCloseBtn) {
      epCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isEpisodesVisible = false;
        toggleEpisodesOverlay(false);
      });
    }

    // Carousel arrows scroll hooks
    const epArrowLeft = document.getElementById('vp-episodes-arrow-left');
    const epArrowRight = document.getElementById('vp-episodes-arrow-right');
    const epCarousel = document.getElementById('vp-episodes-carousel');

    if (epArrowLeft && epArrowRight && epCarousel) {
      epArrowLeft.addEventListener('click', (e) => {
        e.stopPropagation();
        epCarousel.scrollBy({ left: -320, behavior: 'smooth' });
      });

      epArrowRight.addEventListener('click', (e) => {
        e.stopPropagation();
        epCarousel.scrollBy({ left: 320, behavior: 'smooth' });
      });

      const updateArrows = () => {
        const scrollLeft = epCarousel.scrollLeft;
        const maxScroll = epCarousel.scrollWidth - epCarousel.clientWidth;
        epArrowLeft.style.opacity = scrollLeft > 10 ? '1' : '0';
        epArrowLeft.style.pointerEvents = scrollLeft > 10 ? 'auto' : 'none';
        epArrowRight.style.opacity = scrollLeft < maxScroll - 10 ? '1' : '0';
        epArrowRight.style.pointerEvents = scrollLeft < maxScroll - 10 ? 'auto' : 'none';
      };

      epCarousel.addEventListener('scroll', updateArrows);
      setTimeout(updateArrows, 300);
    }

    // Sync vertical brightness slider automatically on filter mutation
    const observer = new MutationObserver(() => {
      const filter = document.documentElement.style.filter || '';
      const match = filter.match(/brightness\(([^)]+)\)/);
      if (match && bSlider && bSliderFill) {
        const val = parseFloat(match[1]);
        const pct = Math.round(val * 100);
        bSlider.value = pct;
        bSliderFill.style.height = pct + '%';
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    // 4. Right-side vertical volume slider (mirror of brightness slider)
    if (!document.getElementById('vp-volume-slider-group')) {
      const volSlider = document.createElement('div');
      volSlider.className = 'vp-volume-slider-group';
      volSlider.id = 'vp-volume-slider-group';
      volSlider.innerHTML = `
        <svg class="vp-volume-slider-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
        <div class="vp-volume-slider-track">
          <input type="range" class="vp-volume-slider-input" id="vp-volume-slider" min="0" max="100" value="100" aria-label="Volume slider">
          <div class="vp-volume-slider-fill" id="vp-volume-slider-fill" style="height: 100%;"></div>
        </div>
      `;
      controls.appendChild(volSlider);
      const vSliderInput = document.getElementById('vp-volume-slider');
      const vSliderFillEl = document.getElementById('vp-volume-slider-fill');
      if (vSliderInput) {
        vSliderInput.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value) / 100;
          const vid = document.getElementById('vp-video');
          if (vid) { vid.volume = val; vid.muted = val === 0; }
          if (vSliderFillEl) vSliderFillEl.style.height = e.target.value + '%';
          // Sync main volume slider
          const mainVol = document.getElementById('vp-volume');
          if (mainVol) mainVol.value = e.target.value;
        });
      }
    }

    // Expose method for PlayerPage to activate TV-only options and set onNext callback
    container._activateTVOptions = function(onNext) {
      if (optEpisodes) optEpisodes.style.display = '';
      if (optNext) {
        optNext.style.display = '';
        optNext.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof onNext === 'function') onNext();
        });
      }
    };
  }
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

  if (existingVideo) {
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
      if (streamData.isOffline) {
        qualitySelect.innerHTML = '<option value="offline" selected>Offline (Local)</option>';
        qualitySelect.disabled = true;
      } else if (allStreams.length > 0) {
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

      // Expose seekOffset getter and setter for updateTime/updateBuffer
      window._playerGetSeekOffset = () => seekOffset;
      window._playerSetSeekOffset = (val) => { seekOffset = val; };

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
      // ── Netflix-style HLS config ──────────────────────────────────────────────
      // Read saved quality preference (set in SettingsPage / SettingsDrawer)
      const savedQualityPref = localStorage.getItem('piq_quality') || 'auto';

      // Determine viewport-capped max resolution (no point fetching pixels the
      // screen can't render — mirrors Netflix's viewport-resolution ceiling).
      const viewportHeight = window.screen.height || window.innerHeight || 1080;

      hls = new Hls({
        // ── Startup & ABR ───────────────────────────────────────────────────────
        startLevel:           -1,            // Let ABR pick the best start level
        abrEwmaDefaultEstimate: 1_500_000,   // Assume 1.5 Mbps initially (faster first segment)
        abrBandWidthFactor:      0.90,       // Use 90% of measured BW (leave headroom)
        abrBandWidthUpFactor:    0.70,       // Conservative upswitch: require 70% overhead

        // ── Buffer sizes (Netflix strategy) ─────────────────────────────────────
        // Keep 30 s ahead; never let hls.js gorge on the whole file.
        maxBufferLength:       30,           // Target forward buffer (seconds)
        maxMaxBufferLength:    60,           // Absolute ceiling
        maxBufferSize:       60 * 1024 * 1024,  // 60 MB max in-memory buffer
        maxBufferHole:          0.5,         // Fill tiny gaps instead of rebuffering

        // ── Back-buffer (memory) ────────────────────────────────────────────────
        // hls.js ≥ 1.x supports backBufferLength; older builds silently ignore it.
        backBufferLength:      30,           // Keep 30 s behind playhead for seek-back

        // ── Latency & recovery ──────────────────────────────────────────────────
        progressive:            true,        // Feed data to MSE as it arrives
        lowLatencyMode:         false,       // We serve VOD, not live
        manifestLoadingTimeOut: 10_000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut:    10_000,
        levelLoadingMaxRetry:    4,
        fragLoadingTimeOut:     20_000,
        fragLoadingMaxRetry:     6,
        fragLoadingRetryDelay:   500,        // ms between retries (exponentially doubles)
      });

      hls.loadSource(streamData.url);
      hls.attachMedia(video);
      video._hls = hls; // Store on video element for reuse

      // ── Quality / ABR ceiling helper ─────────────────────────────────────────
      // Converts the user's saved preference string into a pixel-height cap.
      function getQualityHeightCap(prefStr) {
        const map = { '360p': 360, '480p': 480, '720p': 720, '1080p': 1080, '1440p': 1440, '4k': 2160 };
        if (!prefStr || prefStr === 'auto') return Infinity;
        return map[prefStr] ?? Infinity;
      }

      // Apply ABR ceiling: find the highest level that fits both the user pref
      // AND the viewport height. Falls back gracefully if no level matches.
      function applyAbrCeiling(levels) {
        const prefCap      = getQualityHeightCap(savedQualityPref);
        const effectiveCap = Math.min(prefCap, viewportHeight);
        if (!isFinite(effectiveCap)) {
          hls.autoLevelCapping = -1; // uncapped
          return;
        }
        // Find the highest-resolution level that is ≤ effectiveCap
        let bestLevel = -1;
        levels.forEach((lvl, idx) => {
          if ((lvl.height || 0) <= effectiveCap) bestLevel = idx;
        });
        // If no level fits (e.g. source only has 1080p but cap is 720p),
        // use the lowest available level rather than crashing.
        if (bestLevel === -1 && levels.length > 0) bestLevel = 0;
        hls.autoLevelCapping = bestLevel;
        console.log(`[HLS] ABR ceiling → level ${bestLevel} (${levels[bestLevel]?.height}p) — pref: ${savedQualityPref}, viewportH: ${viewportHeight}px`);
      }

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        // Populate quality selector
        qualitySelect.innerHTML = '<option value="-1">Auto</option>';
        data.levels.forEach((level, i) => {
          const height  = level.height || '?';
          const bitrate = Math.round(level.bitrate / 1000);
          qualitySelect.innerHTML += `<option value="${i}">${height}p (${bitrate}k)</option>`;
        });

        // Apply the saved quality ceiling immediately after levels are known
        applyAbrCeiling(data.levels);

        // If the user has a specific (non-auto) preference, jump directly to the
        // best matching level so there's zero quality-ramp lag on start.
        if (savedQualityPref && savedQualityPref !== 'auto') {
          const prefHeight = getQualityHeightCap(savedQualityPref);
          let bestIdx = -1;
          data.levels.forEach((lvl, idx) => {
            if ((lvl.height || 0) <= prefHeight) bestIdx = idx;
          });
          if (bestIdx === -1 && data.levels.length > 0) bestIdx = 0; // fallback to lowest
          if (bestIdx !== -1) {
            hls.startLevel    = bestIdx;
            hls.currentLevel  = bestIdx;
            // Sync the dropdown to the resolved level
            qualitySelect.value = String(bestIdx);
          }
        }

        loader.style.display = 'none';
        if (startTime > 0) video.currentTime = startTime;
        video.play().catch(err => console.log('[HLS Autoplay] Blocked or interrupted:', err));
      });

      // ── Back-buffer cleanup (sliding window) ──────────────────────────────────
      // Remove segments more than 30 s behind the playhead to free memory,
      // mimicking Netflix's sliding-window buffer strategy.
      const backBufferCleanupInterval = setInterval(() => {
        if (!hls || video.paused) return;
        const currentTime = video.currentTime;
        try {
          // hls.js ≥ 1.5 exposes a dedicated flushBackBuffer; older versions
          // don't have it, so we guard with an existence check.
          if (typeof hls.flushBackBuffer === 'function') {
            hls.flushBackBuffer();
          }
        } catch (_) {}
      }, 10_000); // run every 10 s

      // ── Buffer-starvation quick-recovery ─────────────────────────────────────
      // If the video stalls and the buffer is empty, nudge the loader immediately.
      let stallTimer = null;
      video.addEventListener('waiting', () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          // If still stalled after 3 s, attempt a startLoad() nudge
          if (!video.paused && video.readyState < 3 && hls) {
            console.warn('[HLS] Buffer starvation detected — nudging hls.startLoad()');
            hls.startLoad(video.currentTime);
          }
        }, 3_000);
      });
      video.addEventListener('playing', () => clearTimeout(stallTimer));

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return; // non-fatal errors are handled by hls.js internally
        console.error('[HLS] Fatal error:', data.type, data.details);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // Exponential back-off: wait 1 s before restarting the load
          setTimeout(() => hls.startLoad(), 1_000);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          // Unrecoverable — surface the fatal-error UI
          clearInterval(backBufferCleanupInterval);
          clearTimeout(watchdogTimeout);
          if (onFatalError) onFatalError();
        }
      });

      // Tear down the cleanup interval when the player is destroyed
      const origDestroy = hls.destroy.bind(hls);
      hls.destroy = () => {
        clearInterval(backBufferCleanupInterval);
        clearTimeout(stallTimer);
        origDestroy();
      };
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
      
      // Ensure the subtitle URL is absolute by prefixing NODE_PROXY if relative
      let subUrl = sub.url;
      if (subUrl && subUrl.startsWith('/')) {
        subUrl = `${NODE_PROXY}${subUrl}`;
      }
      track.src = subUrl;
      track.srclang = sub.lan || 'en';
      
      if (i === 0) track.default = true;
      video.appendChild(track);
    });
  }

  // ---- Controls Logic ----
  // ---- Remote Logger (for Droplet Debugging) ----
  function remoteLog(msg, level = 'info') {
    try {
      // Send log back to our PM2 backend
      const proxyUrl = streamData.url ? new URL(streamData.url).origin : '';
      fetch(`${proxyUrl}/api/client-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: `[Player] ${msg}`, level }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }

  // ---- Mobile auto-fullscreen helper ----
  let hasRequestedFullscreen = false;
  function requestMobileFullscreen() {
    remoteLog(`requestMobileFullscreen called. isMobile=${isMobile()}, hasReq=${hasRequestedFullscreen}`);
    if (!isMobile() || hasRequestedFullscreen) return;
    
    // NATIVE CAPACITOR APP (APK)
    if (Capacitor && Capacitor.isNativePlatform()) {
      try {
        StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
        StatusBar.hide().catch(() => {});
        NavigationBar.hide().catch(() => {});
      } catch(e) {}
    }

    const fsTarget = document.getElementById('video-wrapper') || player; // fullscreen the wrapper element
    if (!document.fullscreenElement) {
      const p = fsTarget.requestFullscreen?.() || 
                fsTarget.webkitRequestFullscreen?.() || 
                fsTarget.mozRequestFullScreen?.() || 
                fsTarget.msRequestFullscreen?.();
      
      if (p && p.catch) {
        p.then(() => { 
          hasRequestedFullscreen = true; 
        }).catch((err) => {
          hasRequestedFullscreen = false; // try again on next tap if denied
        });
      } else {
        hasRequestedFullscreen = true;
      }
    } else {
      hasRequestedFullscreen = true;
    }
  }

  // Browsers block fullscreen if the video started via async autoplay.
  // We bind it to the very first touch/click on the player to guarantee it fires inside a user gesture.
  const isActualMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  if (isActualMobile) {
    player.addEventListener('touchstart', requestMobileFullscreen);
    player.addEventListener('click', requestMobileFullscreen);
  }

  // Screen Wake Lock — prevent screen sleep during playback
  let wakeLock = null;
  async function acquireWakeLock() {
    if (Capacitor && Capacitor.isNativePlatform()) {
      try { await KeepAwake.keepAwake(); } catch(e) {}
      return;
    }
    if (!('wakeLock' in navigator)) return;
    try {
      if (!wakeLock || wakeLock.released) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
  }
  function releaseWakeLock() {
    if (Capacitor && Capacitor.isNativePlatform()) {
      try { KeepAwake.allowSleep(); } catch(e) {}
    }
    if (wakeLock && !wakeLock.released) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  function togglePlay() {
    if (video.paused) {
      video.play();
      // On mobile: go fullscreen immediately (this is inside a user-gesture handler)
      requestMobileFullscreen();
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
    if (seekLocked) return;
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

    // On mobile, populate flanking time labels. On desktop, use combined vp-time.
    const timeCurrent = document.getElementById('vp-time-current');
    const timeTotal   = document.getElementById('vp-time-total');
    if (timeCurrent && timeTotal) {
      timeCurrent.textContent = formatTime(cur);
      timeTotal.textContent   = formatTime(dur);
      timeDisplay.textContent = '';
    } else {
      timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    }
    if (!isDragging && dur > 0) {
      const pct = (cur / dur) * 100;
      progressPlayed.style.width = pct + '%';
      progressInput.value = Math.round((cur / dur) * 1000);

      // Real-time active episode card progress sync
      if (isEpisodesVisible) {
        const activeProgress = document.querySelector('.vp-episode-card.active .vp-episode-progress-fill');
        if (activeProgress) {
          activeProgress.style.width = pct + '%';
        }
      }
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
    // Floating title overlay + subtitle nudge
    const titleEl = document.getElementById('vp-top-title');
    const nudge   = document.getElementById('vp-subtitle-nudge');
    if (titleEl) titleEl.classList.add('visible');
    if (nudge)   nudge.classList.add('controls-up');
    // Floating buttons outside the controls bar
    const lockBtn = document.getElementById('vp-lock-btn');
    const diagBtn = document.getElementById('vp-diag-btn');
    if (lockBtn) lockBtn.style.opacity = '1';
    if (diagBtn) diagBtn.style.opacity = '1';
    clearTimeout(controlsTimeout);
    // Mobile: fade controls after 2s; desktop: after 5s
    const timeout = (window.innerWidth <= 768 || ('ontouchstart' in window)) ? 2000 : 5000;
    controlsTimeout = setTimeout(hideControls, timeout);
  }

  function hideControls() {
    if (video.paused || isEpisodesVisible) return;
    controls.classList.remove('vp-visible');
    player.style.cursor = 'none';
    // Fade title overlay + return subtitles to default position
    const titleEl = document.getElementById('vp-top-title');
    const nudge   = document.getElementById('vp-subtitle-nudge');
    if (titleEl) titleEl.classList.remove('visible');
    if (nudge)   nudge.classList.remove('controls-up');
    // Also fade the floating buttons
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
  video.addEventListener('waiting', () => {
    loader.style.display = 'flex';
  });
  video.addEventListener('canplay', () => {
    loader.style.display = 'none';
  });
  video.addEventListener('play', () => {
    acquireWakeLock();
  });
  video.addEventListener('pause', () => {
    releaseWakeLock();
  });
  video.addEventListener('ended', () => {
    bigPlay.style.display = 'flex';
    releaseWakeLock();
    if (onEnded) onEnded();
  });

  // Auto-fullscreen when device rotates to landscape while playing
  if (isMobile()) {
    const onOrientationChange = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape && !video.paused) {
        requestMobileFullscreen();
      }
    };
    window.addEventListener('orientationchange', onOrientationChange);
    screen.orientation?.addEventListener('change', onOrientationChange);
  }

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
      const selectedLevel = parseInt(e.target.value);
      hls.currentLevel = selectedLevel;
      // When the user manually selects a level, update the ABR ceiling to match
      // so hls.js doesn't silently switch back up after a bandwidth spike.
      hls.autoLevelCapping = (selectedLevel === -1) ? -1 : selectedLevel;
    } else {
      const selectedOpt = e.target.options[e.target.selectedIndex];
      const newRawUrl = selectedOpt.dataset.url;
      if (!newRawUrl) return;

      const offset = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
      const resumeTime = Math.floor(video.currentTime + offset);
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

      // Update seekOffset setter for transcoded streams
      if (isTranscoded && window._playerSetSeekOffset) {
        window._playerSetSeekOffset(resumeTime);
      }

      video.src = switchUrl;

      video.addEventListener('loadedmetadata', () => {
        if (savedDuration) knownDuration = savedDuration;
        if (!isTranscoded && resumeTime > 0) {
          video.currentTime = resumeTime;
        }
        seekLocked = false;
        loader.style.display = 'none';
        updateTime();
        if (wasPlaying) video.play();
      }, { once: true });
    }
  });

  // PiP
  pipBtn.addEventListener('click', async () => {
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch (err) {
        console.warn('Failed to exit Picture-in-Picture:', err);
      }
    } else {
      try {
        video.disablePictureInPicture = false;
        await video.requestPictureInPicture?.();
      } catch (err) {
        console.warn('Failed to enter Picture-in-Picture:', err);
      } finally {
        video.disablePictureInPicture = true;
      }
    }
  });

  // ========================================================
  // MOBILE-ONLY ENHANCEMENTS
  // ========================================================
  function isMobile() {
    return true;
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
    const topTitle = document.getElementById('vp-title-text');
    const epBadge = document.getElementById('vp-title-ep-badge');
    if (topTitle) {
      topTitle.textContent = title;
    }
    if (epBadge) {
      if (artist) {
        // artist is e.g. "Season 3 · Episode 5" or with special characters
        const match = artist.match(/Season\s*(\d+)\s*.*\s*Episode\s*(\d+)/i);
        if (match) {
          epBadge.textContent = `S${match[1]} · E${match[2]}`;
          epBadge.style.display = 'inline-block';
        } else {
          epBadge.textContent = artist;
          epBadge.style.display = 'inline-block';
        }
      } else {
        epBadge.style.display = 'none';
      }
    }
    // Activate TV-only bottom bar options if onNext is provided
    if (onNext && typeof container._activateTVOptions === 'function') {
      container._activateTVOptions(onNext);
    }
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
    let lastTouchTime = 0;

    let isMouseDown = false;

    function handleGestureStart(side, e) {
      if (e.type.startsWith('touch')) {
        lastTouchTime = Date.now();
      } else if (e.type.startsWith('mouse')) {
        if (Date.now() - lastTouchTime < 1000) return;
      }

      const t = e.changedTouches ? e.changedTouches[0] : e;
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
      if (e.cancelable) e.preventDefault(); // prevent page scroll during swipe
      const t = e.changedTouches ? e.changedTouches[0] : e;
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
        // Sync vertical volume slider
        const vSliderFill = document.getElementById('vp-volume-slider-fill');
        const vSlider = document.getElementById('vp-volume-slider');
        if (vSliderFill) vSliderFill.style.height = pct + '%';
        if (vSlider) vSlider.value = pct;
        showSwipeOverlay(volOverlay, true);
        autoHideOverlay(volOverlay);
        // Show vertical volume slider
        const volSliderGroup = document.getElementById('vp-volume-slider-group');
        if (volSliderGroup) {
          volSliderGroup.classList.add('vp-volume-active');
          clearTimeout(volSliderGroup._hideTimer);
          volSliderGroup._hideTimer = setTimeout(() => volSliderGroup.classList.remove('vp-volume-active'), 1500);
        }
        touchStartY = t.clientY; // reset for delta-style movement
      } else {
        // Brightness (CSS filter)
        currentBrightness = Math.max(0.2, Math.min(1.0, currentBrightness + delta * 0.5));
        document.documentElement.style.filter = currentBrightness < 1.0 ? `brightness(${currentBrightness.toFixed(2)})` : '';
        localStorage.setItem('piq_brightness', currentBrightness.toFixed(2));
        const pct = Math.round(currentBrightness * 100);
        if (brightVal) brightVal.textContent = pct + '%';
        if (brightBar) brightBar.style.height = pct + '%';
        // Sync vertical brightness slider
        const bSliderFill = document.getElementById('vp-brightness-slider-fill');
        const bSlider = document.getElementById('vp-brightness-slider');
        if (bSliderFill) bSliderFill.style.height = pct + '%';
        if (bSlider) bSlider.value = pct;
        showSwipeOverlay(brightOverlay, true);
        autoHideOverlay(brightOverlay);
        // Show vertical brightness slider
        const brightSliderGroup = document.getElementById('vp-brightness-slider-group');
        if (brightSliderGroup) {
          brightSliderGroup.classList.add('vp-brightness-active');
          clearTimeout(brightSliderGroup._hideTimer);
          brightSliderGroup._hideTimer = setTimeout(() => brightSliderGroup.classList.remove('vp-brightness-active'), 1500);
        }
        touchStartY = t.clientY;
      }
    }

    function handleGestureEnd(side, e) {
      if (e.type.startsWith('touch')) {
        lastTouchTime = Date.now();
      } else if (e.type.startsWith('mouse')) {
        if (Date.now() - lastTouchTime < 1000) return;
      }

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
        if (Capacitor && Capacitor.isNativePlatform()) {
          try { Haptics.impact({ style: ImpactStyle.Medium }); } catch(e) {}
        }
        if (side === 'left') {
          // Rewind 30s
          const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
          const cur = video.currentTime + off;
          if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.max(0, cur - 30));
          else video.currentTime = Math.max(0, video.currentTime - 30);
          showSeekFlash('left');
        } else {
          // Forward 30s
          const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
          const cur = video.currentTime + off;
          const dur = getEffectiveDuration();
          if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.min(dur, cur + 30));
          else video.currentTime = Math.min(dur, video.currentTime + 30);
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

    // Touch listeners
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

    // Mouse listeners for desktop support
    if (gLeft) {
      gLeft.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        handleGestureStart('left', e);
      });
      window.addEventListener('mousemove', (e) => {
        if (isMouseDown && swipeSide === 'left') {
          handleGestureMove('left', e);
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (isMouseDown && swipeSide === 'left') {
          isMouseDown = false;
          handleGestureEnd('left', e);
        }
      });
      // Direct double-click support for desktop mouse seeking
      gLeft.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.max(0, cur - 30));
        else video.currentTime = Math.max(0, video.currentTime - 30);
        showSeekFlash('left');
        showControls();
      });
    }
    if (gRight) {
      gRight.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        handleGestureStart('right', e);
      });
      window.addEventListener('mousemove', (e) => {
        if (isMouseDown && swipeSide === 'right') {
          handleGestureMove('right', e);
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (isMouseDown && swipeSide === 'right') {
          isMouseDown = false;
          handleGestureEnd('right', e);
        }
      });
      // Direct double-click support for desktop mouse seeking
      gRight.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        const dur = getEffectiveDuration();
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.min(dur, cur + 30));
        else video.currentTime = Math.min(dur, video.currentTime + 30);
        showSeekFlash('right');
        showControls();
      });
    }

    // Remove the old video click toggle on mobile/desktop (gesture zones handle it)
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
      // Auto-hide the unlock prompt after 3s — unless we are holding
      if (unlockBtn.classList.contains('holding')) {
        return;
      }
      overlayAutoHideTimer = setTimeout(() => {
        if (!unlockBtn.classList.contains('holding')) {
          lockedOverlay.classList.add('hidden');
        }
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

    lockBtn.addEventListener('mousedown', (e) => {
      if (isLocked) {
        e.stopPropagation();
        showLockedOverlay();
      }
    });

    // Helper functions for hold-to-unlock (Quartic Ease-Out + Spring Retraction)
    let holdTime = 0; // 0 to 2000ms
    let isHolding = false;
    let lastTime = 0;
    let rafId = null;

    const maxOffset = 276.46; // 2 * PI * 44

    function setCircleProgress(progress) {
      const circleBar = document.getElementById('vp-unlock-circle-bar');
      if (circleBar) {
        const offset = maxOffset - (progress * maxOffset);
        circleBar.style.setProperty('stroke-dashoffset', offset.toString(), 'important');
      }
    }

    function unlockLoop(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const elapsed = timestamp - lastTime;
      lastTime = timestamp;

      if (isHolding) {
        holdTime = Math.min(2000, holdTime + elapsed);
      } else {
        holdTime = Math.max(0, holdTime - elapsed * 1.5); // retract slightly faster than charging
      }

      const ratio = holdTime / 2000;
      const progress = 1 - Math.pow(1 - ratio, 4); // Quartic ease-out

      setCircleProgress(progress);

      // Padlock icon animation feedback (slight scaling + jitter rotation)
      const lockIcon = unlockBtn.querySelector('.vp-unlock-lock-icon');
      if (lockIcon) {
        const scale = 1 + progress * 0.15;
        const rotate = isHolding ? (Math.sin(holdTime * 0.05) * progress * 4) : 0;
        lockIcon.style.transform = `scale(${scale}) rotate(${rotate}deg)`;
      }

      if (holdTime === 2000) {
        // Successful unlock
        isLocked = false;
        player.classList.remove('vp-locked');
        clearTimeout(overlayAutoHideTimer);
        lockedOverlay.classList.add('hidden');
        unlockBtn.classList.remove('holding');
        lockBtn.style.opacity = '1';
        lockBtn.querySelector('path').setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
        showControls();

        // Reset state
        isHolding = false;
        holdTime = 0;
        rafId = null;
        setCircleProgress(0);
        if (lockIcon) lockIcon.style.transform = '';
      } else if (holdTime > 0 || isHolding) {
        rafId = requestAnimationFrame(unlockLoop);
      } else {
        rafId = null;
        if (lockIcon) lockIcon.style.transform = '';
      }
    }

    function startUnlockHold(e) {
      if (e) e.stopPropagation();
      isHolding = true;
      unlockBtn.classList.add('holding');
      clearTimeout(overlayAutoHideTimer); // prevent auto-hide while holding
      
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(unlockLoop);
      }
    }

    function stopUnlockHold() {
      isHolding = false;
      unlockBtn.classList.remove('holding');
      if (isLocked) {
        showLockedOverlay();
      }
    }

    // Unlock: hold for 2 seconds
    unlockBtn.addEventListener('touchstart', startUnlockHold, { passive: true });
    unlockBtn.addEventListener('touchend', stopUnlockHold);

    // Mouse support for desktop hold-to-unlock
    unlockBtn.addEventListener('mousedown', startUnlockHold);
    unlockBtn.addEventListener('mouseup', stopUnlockHold);
    unlockBtn.addEventListener('mouseleave', stopUnlockHold);

    // Mousemove listener to reappear unlock overlay on desktop when locked
    player.addEventListener('mousemove', () => {
      if (isLocked) {
        showLockedOverlay();
      }
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
    const isFs = document.fullscreenElement || 
                 document.webkitFullscreenElement || 
                 document.mozFullScreenElement || 
                 document.msFullscreenElement;
    if (isFs) {
      const exitFs = document.exitFullscreen || 
                     document.webkitExitFullscreen || 
                     document.mozCancelFullScreen || 
                     document.msExitFullscreen;
      exitFs.call(document);
    } else {
      const wrapper = document.getElementById('video-wrapper') || player;
      const reqFs = wrapper.requestFullscreen || 
                    wrapper.webkitRequestFullscreen || 
                    wrapper.mozRequestFullScreen || 
                    wrapper.msRequestFullscreen;
      reqFs?.call(wrapper);
    }
  }
  fsBtn.addEventListener('click', toggleFs);

  function updateFsIcon() {
    const isFs = !!(document.fullscreenElement || 
                    document.webkitFullscreenElement || 
                    document.mozFullScreenElement || 
                    document.msFullscreenElement);
    if (fsBtn) {
      const expand = fsBtn.querySelector('.vp-icon-expand');
      const shrink = fsBtn.querySelector('.vp-icon-shrink');
      if (expand) expand.style.display = isFs ? 'none' : '';
      if (shrink) shrink.style.display = isFs ? '' : 'none';
    }
    const topFsBtn = document.getElementById('vp-top-fs-btn');
    if (topFsBtn) {
      const expand = topFsBtn.querySelector('.vp-top-fs-expand');
      const shrink = topFsBtn.querySelector('.vp-top-fs-shrink');
      if (expand) expand.style.display = isFs ? 'none' : '';
      if (shrink) shrink.style.display = isFs ? '' : 'none';
    }
  }

  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
    document.addEventListener(evt, updateFsIcon);
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

    if (isEpisodesVisible) {
      if (e.key === 'Escape') {
        isEpisodesVisible = false;
        toggleEpisodesOverlay(false);
        e.preventDefault();
        return;
      }
      
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const carousel = document.getElementById('vp-episodes-carousel');
        if (carousel) {
          const cards = Array.from(carousel.querySelectorAll('.vp-episode-card'));
          if (cards.length > 0) {
            let activeIndex = cards.indexOf(document.activeElement);
            if (activeIndex === -1) {
              const currentActive = carousel.querySelector('.vp-episode-card.active');
              if (currentActive) {
                currentActive.focus();
              } else {
                cards[0].focus();
              }
              e.preventDefault();
              return;
            }
            
            if (e.key === 'ArrowRight' && activeIndex < cards.length - 1) {
              cards[activeIndex + 1].focus();
              cards[activeIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              e.preventDefault();
            } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
              cards[activeIndex - 1].focus();
              cards[activeIndex - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              e.preventDefault();
            }
          }
        }
        return;
      }
    }

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
      if (diagAbr) diagAbr.textContent = 'Offline (Local File)';
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
    destroy(preserveVideo = false, preserveFullscreen = false) {
      if (diagInterval) {
        clearInterval(diagInterval);
        diagInterval = null;
      }
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
      }
      if (video && !preserveVideo) {
        try {
          video.pause();
          video.src = '';
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
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
      // Release wake lock
      releaseWakeLock();
      
      // Exit fullscreen and restore native status bar
      if (document.fullscreenElement && !preserveFullscreen) {
        document.exitFullscreen?.().catch(() => {});
      }
      if (Capacitor && Capacitor.isNativePlatform()) {
        try { 
          StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
          StatusBar.show().catch(() => {}); 
          NavigationBar.show().catch(() => {});
          ScreenOrientation.lock({ type: 'portrait' }).catch(() => {});
        } catch(e) {}
      }
      subStyle.remove();
      if (!preserveVideo && container) {
        container.innerHTML = '';
      }
    }
  };
}
