// ====================================================================
// GlobalCastManager — Draggable & Resizable Floating Chromecast Remote
// ====================================================================

import { img } from './api.js';

const _piqTabId = Math.random().toString(36).substring(2);

let _globalCastRemotePlayer = null;
let _globalCastController   = null;
let _isGlobalCastListening  = false;

export function initGlobalCastSDK() {
  if (window.__piqGlobalCastSdkLoaded) return;
  window.__piqGlobalCastSdkLoaded = true;

  // Setup Cast SDK available hook
  window['__onGCastApiAvailable'] = (isAvailable) => {
    if (!isAvailable) return;
    try {
      const ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy:        chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        resumeSavedSession:    true, // Automatically reconnect sessions
      });

      // Session lifecycle listener
      ctx.addEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (event) => {
          const { SESSION_STARTED, SESSION_RESUMED, SESSION_ENDED, SESSION_START_FAILED } = cast.framework.SessionState;
          
          if (event.sessionState === SESSION_STARTED || event.sessionState === SESSION_RESUMED) {
            const session = ctx.getCurrentSession();
            if (session) {
              console.log('[Global Cast] Connected / Resumed active session');
              
              if (!_globalCastRemotePlayer) {
                _globalCastRemotePlayer = new cast.framework.RemotePlayer();
                _globalCastController   = new cast.framework.RemotePlayerController(_globalCastRemotePlayer);
              }

              // Bind event listeners if not already done
              setupGlobalCastListeners();
              
              // Trigger UI sync
              window._syncFloatingCastCardVisibility();
            }
          } else if (event.sessionState === SESSION_ENDED || event.sessionState === SESSION_START_FAILED) {
            console.log('[Global Cast] Session ended / failed');
            destroyFloatingCastCard();
            
            // If on the player watch page, resume playback locally
            if (window._triggerLocalPlaybackResume && _globalCastRemotePlayer) {
              const tvTime = _globalCastRemotePlayer.currentTime > 0 ? _globalCastRemotePlayer.currentTime : 0;
              window._triggerLocalPlaybackResume(tvTime);
            }
          }
        }
      );

      // Perform initial check
      setTimeout(() => {
        const session = ctx.getCurrentSession();
        if (session) {
          if (!_globalCastRemotePlayer) {
            _globalCastRemotePlayer = new cast.framework.RemotePlayer();
            _globalCastController   = new cast.framework.RemotePlayerController(_globalCastRemotePlayer);
          }
          setupGlobalCastListeners();
          window._syncFloatingCastCardVisibility();
        }
      }, 500);

    } catch (err) {
      console.warn('[Global Cast SDK] Initialization failed:', err.message);
    }
  };

  // Load Cast SDK script dynamically if not already present
  if (!document.getElementById('cast-sdk-script')) {
    const script = document.createElement('script');
    script.id = 'cast-sdk-script';
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.onerror = () => { window.__piqGlobalCastSdkLoaded = false; };
    document.head.appendChild(script);
  }
}

/**
 * Checks the current route and controls whether the floating remote card
 * should be mounted / shown, or hidden (since the Player page uses the embedded controls).
 */
window._syncFloatingCastCardVisibility = function() {
  if (!window.cast || !cast.framework) return;
  
  const ctx = cast.framework.CastContext.getInstance();
  const session = ctx.getCurrentSession();
  
  if (!session) {
    destroyFloatingCastCard();
    return;
  }

  const hash = window.location.hash || '';
  const isOnPlayerPage = hash.includes('/watch/');

  if (isOnPlayerPage) {
    // Completely unmount/dissolve the floating card when on the watch page to keep only one active player control interface
    destroyFloatingCastCard();
  } else {
    // We are on another page, mount and show the floating control card!
    mountFloatingRemoteCard();
  }
};

// Wire route listener into hash change globally
window.addEventListener('hashchange', window._syncFloatingCastCardVisibility);

/**
 * Stop the global casting session
 */
function disconnectCasting() {
  if (window.cast && cast.framework) {
    try {
      cast.framework.CastContext.getInstance().endCurrentSession(true);
    } catch (e) {}
  }
  destroyFloatingCastCard();
}

/**
 * Setup RemotePlayer Event Listeners for high-priority real-time card synchronization.
 */
function setupGlobalCastListeners() {
  if (!_globalCastController || !_globalCastRemotePlayer || _isGlobalCastListening) return;
  _isGlobalCastListening = true;

  console.log('[Global Cast] Wiring global remote event listeners');

  // Play/Pause state changes
  _globalCastController.addEventListener(
    cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
    () => {
      const paused = _globalCastRemotePlayer.isPaused;
      const livePlayPauseBtn = document.querySelector('#piq-floating-cast-card #floating-cast-playpause');
      if (livePlayPauseBtn) {
        livePlayPauseBtn.innerHTML = paused
          ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      }
    }
  );

  // Real-time Playback Seek progress sync
  _globalCastController.addEventListener(
    cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
    () => {
      const cur = _globalCastRemotePlayer.currentTime;
      const dur = _globalCastRemotePlayer.duration || 1;
      updateCardProgress(cur, dur);
    }
  );

  // Media Duration sync
  _globalCastController.addEventListener(
    cast.framework.RemotePlayerEventType.DURATION_CHANGED,
    () => {
      const cur = _globalCastRemotePlayer.currentTime;
      const dur = _globalCastRemotePlayer.duration || 1;
      updateCardProgress(cur, dur);
    }
  );

  // Volume Level sync
  _globalCastController.addEventListener(
    cast.framework.RemotePlayerEventType.VOLUME_LEVEL_CHANGED,
    () => {
      updateCardVolumeUI(_globalCastRemotePlayer.volumeLevel, _globalCastRemotePlayer.isMuted);
    }
  );

  // Mute state sync
  _globalCastController.addEventListener(
    cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED,
    () => {
      updateCardVolumeUI(_globalCastRemotePlayer.volumeLevel, _globalCastRemotePlayer.isMuted);
    }
  );
}

/**
 * Update seek bar progress in the floating card safely
 */
function updateCardProgress(currentTime, duration) {
  if (window._piqCastCardDraggingSlider) return;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  const liveFill = document.querySelector('#piq-floating-cast-card #floating-cast-slider-fill');
  const liveThumb = document.querySelector('#piq-floating-cast-card #floating-cast-slider-thumb');
  const liveCurrent = document.querySelector('#piq-floating-cast-card #floating-cast-current-time');
  const liveDuration = document.querySelector('#piq-floating-cast-card #floating-cast-duration');
  const headerProgress = document.querySelector('#piq-floating-cast-card #floating-cast-header-progress');

  if (liveFill) liveFill.style.setProperty('width', `${pct}%`, 'important');
  if (liveThumb) liveThumb.style.setProperty('left', `${pct}%`, 'important');
  if (liveCurrent) liveCurrent.textContent = formatTime(currentTime);
  if (liveDuration) liveDuration.textContent = formatTime(duration);
  if (headerProgress) headerProgress.style.setProperty('width', `${pct}%`, 'important');
}

/**
 * Update volume level in the floating card safely
 */
function updateCardVolumeUI(level, isMuted) {
  if (window._piqCastCardDraggingVolume) return;

  const displayLevel = isMuted ? 0 : level;
  
  const liveFill = document.querySelector('#piq-floating-cast-card #floating-cast-volume-fill');
  const liveThumb = document.querySelector('#piq-floating-cast-card #floating-cast-volume-thumb');
  const liveIconUnmuted = document.querySelector('#piq-floating-cast-card #floating-cast-volume-unmuted');
  const liveIconMuted = document.querySelector('#piq-floating-cast-card #floating-cast-volume-muted');

  if (liveFill) liveFill.style.setProperty('width', `${displayLevel * 100}%`, 'important');
  if (liveThumb) liveThumb.style.setProperty('left', `${displayLevel * 100}%`, 'important');
  
  if (liveIconUnmuted && liveIconMuted) {
    if (isMuted || level === 0) {
      liveIconUnmuted.style.display = 'none';
      liveIconMuted.style.display = 'block';
    } else {
      liveIconUnmuted.style.display = 'block';
      liveIconMuted.style.display = 'none';
    }
  }
}

/**
 * Recreate and mount the floating card overlay into the DOM body
 */
export function mountFloatingRemoteCard() {
  let card = document.getElementById('piq-floating-cast-card');
  
  // Retrieve saved media info
  const videoId = localStorage.getItem('piq_cast_videoId');
  const isTV = localStorage.getItem('piq_cast_isTV') === 'true';
  const season = localStorage.getItem('piq_cast_season') || '1';
  const episode = localStorage.getItem('piq_cast_episode') || '1';
  const title = localStorage.getItem('piq_cast_title') || 'Daadi Ki Shaadi';
  
  const imagePath = localStorage.getItem('piq_cast_poster');
  const thumbSrc = imagePath ? (imagePath.startsWith('http') ? imagePath : img.backdrop(imagePath)) : '';

  const ctx = cast.framework.CastContext.getInstance();
  const session = ctx.getCurrentSession();
  const deviceName = session?.getCastDevice()?.friendlyName || 'TV';

  if (card) {
    // Card already exists, ensure it is unhidden
    card.style.display = 'flex';
    
    // Update labels/artwork dynamically if it has changed
    const art = card.querySelector('.floating-cast-artwork');
    if (art && thumbSrc) {
      art.src = thumbSrc;
      art.style.display = 'block';
    }
    const tEl = card.querySelector('.floating-cast-title');
    if (tEl) tEl.textContent = title;
    
    const dEl = card.querySelector('.floating-cast-device');
    if (dEl) dEl.textContent = `Casting to ${deviceName}`;

    // Perform initial state sync for standard values
    if (_globalCastRemotePlayer) {
      updateCardProgress(_globalCastRemotePlayer.currentTime, _globalCastRemotePlayer.duration || 1);
      updateCardVolumeUI(_globalCastRemotePlayer.volumeLevel, _globalCastRemotePlayer.isMuted);
    }
    return;
  }

  // Broadcast active tab ownership claim to other tabs to prevent duplicate cards
  if ('BroadcastChannel' in window) {
    try {
      const claimChannel = new BroadcastChannel('piq_cast_channel');
      claimChannel.postMessage({ type: 'CLAIM_CAST_CARD_OWNERSHIP', sender: _piqTabId });
      claimChannel.close();
    } catch (e) {}
  }  const isMobile = window.innerWidth <= 768;

  // Retrieve saved placement/geometry coordinates
  const savedX = localStorage.getItem('piq_cast_card_x');
  const savedY = localStorage.getItem('piq_cast_card_y');
  const savedW = localStorage.getItem('piq_cast_card_w') || '340';
  const savedH = localStorage.getItem('piq_cast_card_h') || 'auto';
  const isInitiallyCollapsed = localStorage.getItem('piq_cast_card_collapsed') === 'true';

  // Calculate default viewport coordinates
  let posX = window.innerWidth - parseInt(savedW) - 40;
  let posY = 100;

  if (savedX !== null && savedY !== null) {
    // Restrict within viewport bounds dynamically on mount
    posX = Math.max(0, Math.min(parseInt(savedX), window.innerWidth - parseInt(savedW)));
    posY = Math.max(0, Math.min(parseInt(savedY), window.innerHeight - 300));
  } else if (isMobile) {
    // Default mobile positioning at the bottom-right corner
    const defaultMobileW = isInitiallyCollapsed ? 280 : 320;
    posX = window.innerWidth - defaultMobileW - 16;
    posY = window.innerHeight - (isInitiallyCollapsed ? 140 : 380);
  }

  card = document.createElement('div');
  card.id = 'piq-floating-cast-card';
  card.className = 'piq-floating-cast-card' + (isInitiallyCollapsed ? ' collapsed' : '');
  
  const initialH = isInitiallyCollapsed ? '52px' : (savedH === 'auto' ? 'auto' : `${savedH}px`);

  // Inline placement coordinates
  card.style.cssText = `
    position: fixed !important;
    left: ${posX}px !important;
    top: ${posY}px !important;
    width: ${savedW}px !important;
    height: ${initialH}px !important;
    right: auto !important;
    bottom: auto !important;
    display: flex !important;
  `;

  card.innerHTML = `
    <div class="floating-cast-ambient" style="background-image: url('${thumbSrc}')"></div>
    
    <!-- Drag Handle Header -->
    <div class="floating-cast-header">
      <div class="floating-cast-drag-indicator">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;opacity:0.6;">
          <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
          <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </div>
      
      <!-- Sleek circular movie poster preview -->
      <div class="floating-cast-header-thumb-wrap">
        <img class="floating-cast-header-thumb" src="${thumbSrc}" onerror="this.style.display='none';">
        <div class="floating-cast-pulse-dot" id="floating-cast-header-pulse"></div>
      </div>
      
      <div class="floating-cast-meta">
        <h4 class="floating-cast-title">${title}</h4>
        <span class="floating-cast-device">Casting to ${deviceName}</span>
      </div>
      
      <div class="floating-cast-header-actions">
        <button class="floating-cast-close-btn floating-cast-header-return-btn" id="floating-cast-header-return-btn" title="Return to Player">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
        </button>
        <button class="floating-cast-close-btn" id="floating-cast-hide-btn" title="Toggle Remote Size">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;">
            <polyline points="4 9 12 17 20 9"/>
          </svg>
        </button>
      </div>    <div class="floating-cast-header-progress" id="floating-cast-header-progress"></div>
    </div>

    <!-- Body Artwork Card -->
    <div class="floating-cast-body">
      <div class="floating-cast-artwork-container">
        <img class="floating-cast-artwork" src="${thumbSrc}" alt="Poster" onerror="this.style.display='none';" />
      </div>
      
      <!-- Timeline Scrubbing -->
      <div class="floating-cast-timeline">
        <div class="floating-cast-slider-container" id="floating-cast-slider-container">
          <div class="floating-cast-slider-track">
            <div class="floating-cast-slider-fill" id="floating-cast-slider-fill" style="width: 0%;"></div>
          </div>
          <div class="floating-cast-slider-thumb" id="floating-cast-slider-thumb" style="left: 0%;"></div>
        </div>
        <div class="floating-cast-time-labels">
          <span id="floating-cast-current-time">00:00</span>
          <span id="floating-cast-duration">00:00</span>
        </div>
      </div>

      <!-- Playback Control Buttons -->
      <div class="floating-cast-playback-controls">
        <button class="floating-cast-btn skip-back" id="floating-cast-skip-back" title="Rewind 10s">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <polyline points="3 3 3 8 8 8"/>
            <text x="12" y="15" font-size="8" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none" style="font-family:system-ui">10</text>
          </svg>
        </button>
        <button class="floating-cast-btn playpause-btn" id="floating-cast-playpause" title="Play/Pause">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="floating-cast-btn skip-forward" id="floating-cast-skip-forward" title="Forward 10s">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;">
            <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <polyline points="21 3 21 8 16 8"/>
            <text x="12" y="15" font-size="8" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none" style="font-family:system-ui">10</text>
          </svg>
        </button>
      </div>

      <!-- Volume & Return Navigation Controls -->
      <div class="floating-cast-bottom-actions">
        <div class="floating-cast-volume">
          <button class="floating-cast-volume-btn" id="floating-cast-volume-btn" title="Mute/Unmute">
            <svg id="floating-cast-volume-unmuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            <svg id="floating-cast-volume-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;display:none;">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>
            </svg>
          </button>
          <div class="floating-cast-volume-slider-wrapper" id="floating-cast-volume-slider-wrapper">
            <div class="floating-cast-volume-track">
              <div class="floating-cast-volume-fill" id="floating-cast-volume-fill" style="width: 80%;"></div>
            </div>
            <div class="floating-cast-volume-thumb" id="floating-cast-volume-thumb" style="left: 80%;"></div>
          </div>
        </div>

        <div class="floating-cast-buttons">
          <button class="floating-cast-action-btn return-btn" id="floating-cast-return-btn" title="Return to Fullscreen Player">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
            <span>Return</span>
          </button>
          <button class="floating-cast-action-btn disconnect-btn" id="floating-cast-disconnect-btn" title="Stop Casting TV Session">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
            </svg>
            <span>Stop</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Drag / Resize Handle -->
    <div class="floating-cast-resize-handle" title="Drag to Resize Card"></div>
  `;

  document.body.appendChild(card);

  // ---- 1. Bind JS Drag & Placement Handlers ----
  const dragHandle = card.querySelector('.floating-cast-header');
  let isDragging = false;
  let startX = 0, startY = 0;
  let cardX = 0, cardY = 0;

  dragHandle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('button')) return; // Ignore button clicks

    isDragging = true;
    dragHandle.setPointerCapture(e.pointerId);
    
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = card.getBoundingClientRect();
    cardX = rect.left;
    cardY = rect.top;
    
    card.classList.add('dragging');
  });

  dragHandle.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    let newX = cardX + deltaX;
    let newY = cardY + deltaY;
    
    // Boundary restrictions (prevent card disappearing off viewport)
    const rect = card.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));
    
    card.style.setProperty('left', `${newX}px`, 'important');
    card.style.setProperty('top', `${newY}px`, 'important');
  });

  dragHandle.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    dragHandle.releasePointerCapture(e.pointerId);
    card.classList.remove('dragging');
    
    const rect = card.getBoundingClientRect();
    localStorage.setItem('piq_cast_card_x', Math.round(rect.left));
    localStorage.setItem('piq_cast_card_y', Math.round(rect.top));
  });

  // ---- 2. Bind JS Drag Resizing Handlers ----
  const resizeHandle = card.querySelector('.floating-cast-resize-handle');
  let isResizing = false;
  let startW = 340, startH = 200;

  resizeHandle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isResizing = true;
    resizeHandle.setPointerCapture(e.pointerId);
    
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = card.getBoundingClientRect();
    startW = rect.width;
    startH = rect.height;
    
    card.classList.add('resizing');
    e.stopPropagation();
  });

  resizeHandle.addEventListener('pointermove', (e) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    let newW = startW + deltaX;
    let newH = startH + deltaY;
    
    // Bounds limits
    newW = Math.max(300, Math.min(newW, 550));
    newH = Math.max(180, Math.min(newH, 480));
    
    const rect = card.getBoundingClientRect();
    if (rect.left + newW > window.innerWidth) {
      newW = window.innerWidth - rect.left;
    }
    if (rect.top + newH > window.innerHeight) {
      newH = window.innerHeight - rect.top;
    }
    
    card.style.setProperty('width', `${newW}px`, 'important');
    card.style.setProperty('height', `${newH}px`, 'important');
  });

  resizeHandle.addEventListener('pointerup', (e) => {
    if (!isResizing) return;
    isResizing = false;
    resizeHandle.releasePointerCapture(e.pointerId);
    card.classList.remove('resizing');
    
    const rect = card.getBoundingClientRect();
    localStorage.setItem('piq_cast_card_w', Math.round(rect.width));
    localStorage.setItem('piq_cast_card_h', Math.round(rect.height));
  });

  // ---- 3. Bind TV Action Button Handlers ----
  const playpauseBtn    = card.querySelector('#floating-cast-playpause');
  const skipBackBtn     = card.querySelector('#floating-cast-skip-back');
  const skipForwardBtn  = card.querySelector('#floating-cast-skip-forward');
  const volumeBtn       = card.querySelector('#floating-cast-volume-btn');
  const volumeSlider    = card.querySelector('#floating-cast-volume-slider-wrapper');
  const returnBtn       = card.querySelector('#floating-cast-return-btn');
  const headerReturnBtn = card.querySelector('#floating-cast-header-return-btn');
  const disconnectBtn   = card.querySelector('#floating-cast-disconnect-btn');
  const hideBtn         = card.querySelector('#floating-cast-hide-btn');

  const sliderContainer = card.querySelector('#floating-cast-slider-container');

  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      const isCollapsed = card.classList.contains('collapsed');
      if (isCollapsed) {
        // Expand!
        card.classList.remove('collapsed');
        localStorage.setItem('piq_cast_card_collapsed', 'false');
        
        // Restore expanded height
        const savedH = localStorage.getItem('piq_cast_card_h') || 'auto';
        if (savedH && savedH !== 'auto') {
          card.style.setProperty('height', `${savedH}px`, 'important');
        } else {
          card.style.setProperty('height', 'auto', 'important');
        }
      } else {
        // Collapse!
        // Save current expanded height to piq_cast_card_h before collapsing
        const rect = card.getBoundingClientRect();
        if (!card.classList.contains('resizing')) {
          localStorage.setItem('piq_cast_card_h', Math.round(rect.height));
        }
        
        card.classList.add('collapsed');
        localStorage.setItem('piq_cast_card_collapsed', 'true');
        card.style.setProperty('height', '52px', 'important');
      }
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', disconnectCasting);
  }

  let isReturnClicked = false;
  const handleReturnClick = (btnEl) => {
    if (isReturnClicked) return;
    isReturnClicked = true;

    // Glow animation feedback
    if (btnEl) {
      btnEl.classList.add('clicking');
      setTimeout(() => btnEl.classList.remove('clicking'), 800);
    }
    setTimeout(() => { isReturnClicked = false; }, 1000); // 1s throttle

    if (videoId) {
      const watchType = isTV ? 'tv' : 'movie';
      let route = `watch/${watchType}/${videoId}`;
      if (isTV) {
        route += `?s=${season}&e=${episode}`;
      }

      // Multi-tab focus check
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('piq_cast_channel');
        let pongReceived = false;

        const handlePong = (e) => {
          if (e.data.type === 'PONG_PLAYER_TAB') {
            pongReceived = true;
            console.log('[Cast Return] Active player page found in another tab. Focused successfully.');
          }
        };
        channel.addEventListener('message', handlePong);
        channel.postMessage({ type: 'PING_PLAYER_TAB' });

        // Wait 250ms for tab response. If none, navigate here.
        setTimeout(() => {
          channel.removeEventListener('message', handlePong);
          channel.close();
          if (!pongReceived) {
            window.location.hash = `#/${route}`;
          }
        }, 250);
      } else {
        window.location.hash = `#/${route}`;
      }
    }
  };

  if (returnBtn) {
    returnBtn.addEventListener('click', () => handleReturnClick(returnBtn));
  }
  if (headerReturnBtn) {
    headerReturnBtn.addEventListener('click', () => handleReturnClick(headerReturnBtn));
  }

  if (playpauseBtn && _globalCastController) {
    playpauseBtn.addEventListener('click', () => {
      _globalCastController.playOrPause();
    });
  }

  if (skipBackBtn && _globalCastController && _globalCastRemotePlayer) {
    skipBackBtn.addEventListener('click', () => {
      const newTime = Math.max(0, _globalCastRemotePlayer.currentTime - 10);
      _globalCastRemotePlayer.currentTime = newTime;
      _globalCastController.seek();
    });
  }

  if (skipForwardBtn && _globalCastController && _globalCastRemotePlayer) {
    skipForwardBtn.addEventListener('click', () => {
      const duration = _globalCastRemotePlayer.duration || 0;
      const newTime = Math.min(duration, _globalCastRemotePlayer.currentTime + 10);
      _globalCastRemotePlayer.currentTime = newTime;
      _globalCastController.seek();
    });
  }

  // Pointer dragging on seek bar (timeline seek)
  if (sliderContainer) {
    const handleSliderDrag = (e, shouldSeek = false) => {
      if (!_globalCastRemotePlayer || !_globalCastController) return;
      const rect = sliderContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const pct = Math.min(1.0, Math.max(0.0, clickX / width));
      const duration = _globalCastRemotePlayer.duration || 0;
      
      const newTime = duration * pct;
      const liveFill = document.querySelector('#piq-floating-cast-card #floating-cast-slider-fill');
      const liveThumb = document.querySelector('#piq-floating-cast-card #floating-cast-slider-thumb');
      const liveCurrent = document.querySelector('#piq-floating-cast-card #floating-cast-current-time');

      if (liveFill) liveFill.style.setProperty('width', `${pct * 100}%`, 'important');
      if (liveThumb) liveThumb.style.setProperty('left', `${pct * 100}%`, 'important');
      if (liveCurrent) liveCurrent.textContent = formatTime(newTime);
      
      if (shouldSeek) {
        _globalCastRemotePlayer.currentTime = newTime;
        _globalCastController.seek();
      }
    };
    
    sliderContainer.addEventListener('pointerdown', (e) => {
      window._piqCastCardDraggingSlider = true;
      sliderContainer.setPointerCapture(e.pointerId);
      handleSliderDrag(e);
    });
    
    sliderContainer.addEventListener('pointermove', (e) => {
      if (window._piqCastCardDraggingSlider) handleSliderDrag(e);
    });
    
    sliderContainer.addEventListener('pointerup', (e) => {
      if (window._piqCastCardDraggingSlider) {
        window._piqCastCardDraggingSlider = false;
        sliderContainer.releasePointerCapture(e.pointerId);
        handleSliderDrag(e, true /* shouldSeek */);
      }
    });
  }

  // Pointer dragging on volume slider
  if (volumeSlider) {
    const handleVolumeDrag = (e, shouldSet = false) => {
      if (!_globalCastRemotePlayer || !_globalCastController) return;
      const rect = volumeSlider.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const pct = Math.min(1.0, Math.max(0.0, clickX / width));
      
      const liveFill = document.querySelector('#piq-floating-cast-card #floating-cast-volume-fill');
      const liveThumb = document.querySelector('#piq-floating-cast-card #floating-cast-volume-thumb');

      if (liveFill) liveFill.style.setProperty('width', `${pct * 100}%`, 'important');
      if (liveThumb) liveThumb.style.setProperty('left', `${pct * 100}%`, 'important');
      
      if (shouldSet) {
        _globalCastRemotePlayer.volumeLevel = pct;
        _globalCastController.setVolumeLevel();
        if (_globalCastRemotePlayer.isMuted && pct > 0) {
          _globalCastController.muteOrUnmute();
        }
      }
    };
    
    volumeSlider.addEventListener('pointerdown', (e) => {
      window._piqCastCardDraggingVolume = true;
      volumeSlider.setPointerCapture(e.pointerId);
      handleVolumeDrag(e);
    });
    
    volumeSlider.addEventListener('pointermove', (e) => {
      if (window._piqCastCardDraggingVolume) handleVolumeDrag(e);
    });
    
    volumeSlider.addEventListener('pointerup', (e) => {
      if (window._piqCastCardDraggingVolume) {
        window._piqCastCardDraggingVolume = false;
        volumeSlider.releasePointerCapture(e.pointerId);
        handleVolumeDrag(e, true /* shouldSet */);
      }
    });
  }

  if (volumeBtn && _globalCastController) {
    volumeBtn.addEventListener('click', () => {
      _globalCastController.muteOrUnmute();
    });
  }

  // Synchronize initial state
  if (_globalCastRemotePlayer) {
    const paused = _globalCastRemotePlayer.isPaused;
    if (playpauseBtn) {
      playpauseBtn.innerHTML = paused
        ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }
    updateCardProgress(_globalCastRemotePlayer.currentTime, _globalCastRemotePlayer.duration || 1);
    updateCardVolumeUI(_globalCastRemotePlayer.volumeLevel, _globalCastRemotePlayer.isMuted);
  }
}

/**
 * Stop casting session completely and clean up elements
 */
export function destroyFloatingCastCard() {
  const card = document.getElementById('piq-floating-cast-card');
  if (card) card.remove();
}

/**
 * Formatting timeline duration values (seconds -> HH:MM:SS)
 */
function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const pad = (n) => String(n).padStart(2, '0');
  
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

// ---- Multi-Tab Focus Coordination Channel ----
if ('BroadcastChannel' in window) {
  const globalChannel = new BroadcastChannel('piq_cast_channel');
  globalChannel.addEventListener('message', (e) => {
    if (e.data.type === 'PING_PLAYER_TAB') {
      const hash = window.location.hash || '';
      const isOnPlayerPage = hash.includes('/watch/');
      if (isOnPlayerPage) {
        globalChannel.postMessage({ type: 'PONG_PLAYER_TAB' });
        
        // Focus the window/tab.
        window.focus();
        
        // Browser notification alert fallback if window.focus() is blocked
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('PlayerIQ: Reconnected! 🍿', {
            body: 'Your casting controller was refocused on this tab.',
            icon: '/favicon.ico'
          });
        }
      }
    } else if (e.data.type === 'CLAIM_CAST_CARD_OWNERSHIP') {
      if (e.data.sender !== _piqTabId) {
        console.log('[Global Cast] Another tab claimed ownership. Unmounting card from this tab.');
        destroyFloatingCastCard();
      }
    }
  });
}

function claimCardOwnership() {
  const hash = window.location.hash || '';
  const isOnPlayerPage = hash.includes('/watch/');
  if (isOnPlayerPage) return; // Watch page handles controls directly and doesn't show the card

  if (window.cast && cast.framework) {
    try {
      const ctx = cast.framework.CastContext.getInstance();
      const session = ctx.getCurrentSession();
      if (session) {
        // Send claim message to other tabs
        if ('BroadcastChannel' in window) {
          const claimChannel = new BroadcastChannel('piq_cast_channel');
          claimChannel.postMessage({ type: 'CLAIM_CAST_CARD_OWNERSHIP', sender: _piqTabId });
          claimChannel.close();
        }
        // Mount/recreate card locally on the active tab
        mountFloatingRemoteCard();
      }
    } catch (err) {}
  }
}

// Wire active tab focus/visibility handlers
window.addEventListener('focus', claimCardOwnership);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    claimCardOwnership();
  }
});
