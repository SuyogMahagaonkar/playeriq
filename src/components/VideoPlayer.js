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
export function createVideoPlayer(container, streamData, onProgress = null, onFatalError = null, onEnded = null, startTime = 0) {
  let hls = null;
  let controlsTimeout = null;
  let isDragging = false;

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

            <button class="vp-btn" id="vp-fs-btn" title="Fullscreen (F)" aria-label="Toggle Fullscreen">
              <svg class="vp-icon-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              <svg class="vp-icon-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Provider badge -->
      <div class="vp-provider" id="vp-provider">${streamData.provider || 'Custom'}</div>
    </div>
  `;

  // ---- Elements ----
  const player = document.getElementById('vp-player');
  const video = document.getElementById('vp-video');

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
  const fsBtn = document.getElementById('vp-fs-btn');

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
    });
    hls.loadSource(streamData.url);
    hls.attachMedia(video);

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

  // Load subtitles
  if (streamData.subtitles?.length) {
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
    // For MP4/transcoded streams: knownDuration (from API/TMDB) is ALWAYS
    // preferred. video.duration on fMP4 streams is just the current buffer
    // size (30s, 60s...) — never the real movie length.
    if (isMP4 && knownDuration) return knownDuration;

    // For HLS streams: video.duration is reliable
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
    const offset = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
    if (video.buffered.length > 0 && dur > 0) {
      const buffEnd = video.buffered.end(video.buffered.length - 1) + offset;
      progressBuffer.style.width = Math.min(100, (buffEnd / dur) * 100) + '%';
    }
  }

  function showControls() {
    controls.classList.add('vp-visible');
    player.style.cursor = '';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(hideControls, 3000);
  }

  function hideControls() {
    if (video.paused) return;
    controls.classList.remove('vp-visible');
    player.style.cursor = 'none';
  }

  // ---- Event Listeners ----
  video.addEventListener('play', updatePlayIcon);
  video.addEventListener('pause', updatePlayIcon);
  video.addEventListener('timeupdate', updateTime);
  video.addEventListener('progress', updateBuffer);
  video.addEventListener('waiting', () => { loader.style.display = 'flex'; });
  video.addEventListener('canplay', () => { loader.style.display = 'none'; });
  video.addEventListener('ended', () => {
    bigPlay.style.display = 'flex';
    if (onEnded) onEnded();
  });
  // For HLS streams: update knownDuration when browser learns real duration.
  // For MP4/transcoded streams: NEVER update from durationchange — the browser
  // reports partial buffer sizes (30s, 60s...) as duration for fMP4 streams.
  // The API-provided knownDuration is the only reliable source of truth for MP4.
  if (!isMP4) {
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
      window._playerPerformSeek(Math.max(0, cur - 10));
    } else {
      video.currentTime = Math.max(0, video.currentTime - 10);
    }
  });
  skipForward.addEventListener('click', () => {
    const offset = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
    const cur = video.currentTime + offset;
    const dur = getEffectiveDuration();
    if (isTranscoded && window._playerPerformSeek) {
      window._playerPerformSeek(Math.min(dur, cur + 10));
    } else {
      video.currentTime = Math.min(dur, video.currentTime + 10);
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
  player.addEventListener('mousemove', showControls);
  player.addEventListener('mouseleave', hideControls);
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
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.max(0, cur - 10));
        else video.currentTime = Math.max(0, video.currentTime - 10);
        showControls();
        e.preventDefault();
        break;
      }
      case 'l': {
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        const dur = getEffectiveDuration();
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.min(dur, cur + 10));
        else video.currentTime = Math.min(dur, video.currentTime + 10);
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
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.max(0, cur - 10));
        else video.currentTime = Math.max(0, video.currentTime - 10);
        showControls();
        e.preventDefault();
        break;
      }
      case 'ArrowRight': {
        const off = (isTranscoded && window._playerGetSeekOffset) ? window._playerGetSeekOffset() : 0;
        const cur = video.currentTime + off;
        const dur = getEffectiveDuration();
        if (isTranscoded && window._playerPerformSeek) window._playerPerformSeek(Math.min(dur, cur + 10));
        else video.currentTime = Math.min(dur, video.currentTime + 10);
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

  // Double-click for fullscreen
  video.addEventListener('dblclick', toggleFs);

  // ---- Cleanup ----
  return {
    destroy() {
      if (hls) {
        hls.destroy();
        hls = null;
      }
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(controlsTimeout);
      clearTimeout(watchdogTimeout);
      container.innerHTML = '';
    }
  };
}
