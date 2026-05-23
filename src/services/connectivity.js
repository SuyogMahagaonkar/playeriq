// ========================================
// PlayerIQ — Connectivity Service (YouTube-style)
// Uses active HTTP probing every 10s in addition to navigator.onLine events.
// navigator.onLine alone is unreliable — it only checks if a network interface
// is connected, not if you have real internet (e.g., hotel wifi with no internet).
// ========================================

const PROBE_URL = '/favicon.ico';
const PROBE_INTERVAL_MS = 10_000;    // Check every 10 seconds
const PROBE_TIMEOUT_MS  = 4_000;     // 4-second timeout per probe
const RECONNECT_GRACE_MS = 800;      // Debounce rapid transitions

let _isOnline = navigator.onLine;
let _probeTimer = null;
let _lastProbeSuccess = navigator.onLine ? Date.now() : 0;
let _reconnectGraceTimer = null;
const _listeners = new Set();

// ---- Public API ----

export function isOnline() {
  return _isOnline;
}

/** Register a callback for connectivity changes.
 *  Callback receives `{ online: boolean, wasOffline: boolean }`.
 *  Returns an unsubscribe function. */
export function onConnectivityChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/** Initialize the connectivity service.
 *  Call once on app boot. */
export function initConnectivity() {
  // Listen to native browser online/offline events (fast)
  window.addEventListener('online',  () => _scheduleProbe(true));
  window.addEventListener('offline', () => _handleOffline());

  // Active probe loop
  _startProbeLoop();

  // Run an initial probe after a short delay
  setTimeout(_runProbe, 1200);

  console.log('[ConnectivityService] Initialized. Current state:', _isOnline ? 'ONLINE' : 'OFFLINE');
}

// ---- Internal ----

function _startProbeLoop() {
  if (_probeTimer) clearInterval(_probeTimer);
  _probeTimer = setInterval(_runProbe, PROBE_INTERVAL_MS);
}

function _scheduleProbe(immediate = false) {
  if (immediate) {
    // Slight delay to let the connection settle
    setTimeout(_runProbe, 300);
  }
}

async function _runProbe() {
  // Skip if the browser already says we're offline — save the request
  if (!navigator.onLine) {
    if (_isOnline) _handleOffline();
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    // Use no-cache to bypass service worker cache
    await fetch(`${PROBE_URL}?_t=${Date.now()}`, {
      method: 'HEAD',
      cache:  'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    _lastProbeSuccess = Date.now();
    _handleOnline();

  } catch (err) {
    // Abort = timeout, TypeError = network failure
    if (!navigator.onLine) {
      _handleOffline();
    }
    // If navigator.onLine is still true but probe failed, don't flap state.
    // Only call offline if we've had no success for >PROBE_TIMEOUT_MS * 2
    else if (Date.now() - _lastProbeSuccess > PROBE_TIMEOUT_MS * 2) {
      _handleOffline();
    }
  }
}

function _handleOnline() {
  const wasOffline = !_isOnline;
  _isOnline = true;

  // Debounce rapid online/offline flapping
  if (_reconnectGraceTimer) return;

  _reconnectGraceTimer = setTimeout(() => {
    _reconnectGraceTimer = null;
    _notify({ online: true, wasOffline });

    if (wasOffline) {
      window.dispatchEvent(new CustomEvent('piq-reconnected'));
    }
    window.dispatchEvent(new CustomEvent('piq-online'));
  }, RECONNECT_GRACE_MS);
}

function _handleOffline() {
  if (!_isOnline) return; // Already offline, don't re-emit
  _isOnline = false;

  // Cancel any pending reconnect grace
  if (_reconnectGraceTimer) {
    clearTimeout(_reconnectGraceTimer);
    _reconnectGraceTimer = null;
  }

  _notify({ online: false, wasOffline: false });
  window.dispatchEvent(new CustomEvent('piq-offline'));
}

function _notify(state) {
  _listeners.forEach(cb => {
    try { cb(state); } catch (e) { console.warn('[ConnectivityService] Listener error:', e); }
  });
}
