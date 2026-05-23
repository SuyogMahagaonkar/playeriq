// ========================================
// PlayerIQ — Native Offline Download Manager (Capacitor v8)
// Uses streaming fetch with real chunk-by-chunk progress tracking
// ========================================

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const DOWNLOADS_KEY = 'piq_native_downloads';

function getDownloadsData() {
  try {
    const data = localStorage.getItem(DOWNLOADS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

function saveDownloadsData(data) {
  localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('downloadsUpdated'));
}

function dispatchProgress(id, progress, status = 'DOWNLOADING') {
  window.dispatchEvent(new CustomEvent('download-progress', { detail: { id, progress, status } }));
}

function dispatchStatusChange(id, status) {
  window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status } }));
}

export const DownloadManager = {

  async getSettings() {
    return { wifiOnly: false, quality: 'standard' };
  },

  async setSetting(key, value) {
    return true;
  },

  // -------------------------------------------------------
  // Core download using streaming fetch → real-time progress
  // -------------------------------------------------------
  async start(id, type, title, posterPath) {
    console.log(`[DownloadManager] Starting: ${title} (${id})`);

    if (!Capacitor.isNativePlatform()) {
      this.mockWebDownload(id, type, title, posterPath);
      return;
    }

    const data = getDownloadsData();
    if (data[id] && data[id].status === 'COMPLETED') {
      alert(`"${title}" is already downloaded and ready to watch!`);
      return;
    }

    const fileName = `${id}.mp4`;
    data[id] = {
      id, type, title, posterPath,
      progress: 0,
      status: 'DOWNLOADING',
      fileName,
      totalSize: 0,
      timestamp: Date.now()
    };
    saveDownloadsData(data);
    dispatchStatusChange(id, 'DOWNLOADING');

    // Public MP4 test URLs with guaranteed CORS support — tried in order
    // These are standard media testing CDNs used by major browser vendors
    const testUrls = [
      'https://www.w3schools.com/html/mov_bbb.mp4',                               // W3Schools ~1MB
      'https://media.w3.org/2010/05/sintel/trailer.mp4',                          // W3C Media CORS ~5MB
      'https://vjs.zencdn.net/v/oceans.mp4',                                      // VideoJS CDN ~15MB
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', // MDN ~3MB
    ];

    try {
      await this._streamDownloadWithFallback(id, testUrls, fileName);
    } catch (e) {
      console.error('[DownloadManager] Download failed:', e.message || e);
      alert(`Download failed: ${e.message || 'Network error. Check your connection.'}`);
      const cur = getDownloadsData();
      if (cur[id]) {
        cur[id].status = 'ERROR';
        saveDownloadsData(cur);
        dispatchStatusChange(id, 'ERROR');
      }
    }
  },

  // Try multiple URLs in order, use the first that responds with 200
  async _streamDownloadWithFallback(id, urls, fileName) {
    let lastError = null;
    for (const url of urls) {
      try {
        console.log(`[DownloadManager] Trying: ${url}`);
        await this._streamDownload(id, url, fileName);
        return; // success
      } catch (e) {
        console.warn(`[DownloadManager] ${url} failed: ${e.message}, trying next...`);
        lastError = e;
      }
    }
    throw lastError || new Error('All download URLs failed. Check your internet connection.');
  },

  // Streaming fetch — reads chunks one by one, updates progress in real time
  async _streamDownload(id, url, fileName) {
    console.log(`[DownloadManager] Fetching: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'video/mp4,video/*,*/*;q=0.9' }
    });
    if (!response.ok) throw new Error(`Server error: HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();

    let receivedBytes = 0;
    const chunks = [];
    let lastReportedPct = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedBytes += value.length;

      // Calculate real progress percentage
      const pct = contentLength > 0
        ? Math.min(99, Math.round((receivedBytes / contentLength) * 100))
        : Math.min(99, Math.round((receivedBytes / (10 * 1024 * 1024)) * 100));

      // Only fire event if it changed (reduces unnecessary renders)
      if (pct !== lastReportedPct) {
        lastReportedPct = pct;
        const cur = getDownloadsData();
        if (!cur[id] || cur[id].status !== 'DOWNLOADING') break; // cancelled
        cur[id].progress = pct;
        cur[id].totalSize = contentLength || receivedBytes;
        saveDownloadsData(cur);
        dispatchProgress(id, pct);
      }
    }

    // Combine all chunks into one Uint8Array
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const allBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      allBytes.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to base64 and write to native filesystem
    const base64 = _uint8ArrayToBase64(allBytes);

    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Data,
      recursive: true
    });

    // Mark complete
    const cur = getDownloadsData();
    if (cur[id]) {
      cur[id].status = 'COMPLETED';
      cur[id].progress = 100;
      cur[id].totalSize = totalLength;
      saveDownloadsData(cur);
      dispatchProgress(id, 100, 'COMPLETED');
      dispatchStatusChange(id, 'COMPLETED');
    }

    console.log(`[DownloadManager] Saved ${fileName} (${(totalLength / 1024 / 1024).toFixed(1)} MB)`);
  },

  // Web mock for browser testing
  mockWebDownload(id, type, title, posterPath) {
    const data = getDownloadsData();
    data[id] = { id, type, title, posterPath, progress: 0, status: 'DOWNLOADING', timestamp: Date.now() };
    saveDownloadsData(data);

    let progress = 0;
    const interval = setInterval(() => {
      const cur = getDownloadsData();
      if (!cur[id] || cur[id].status !== 'DOWNLOADING') { clearInterval(interval); return; }
      progress += Math.floor(Math.random() * 6) + 3;
      if (progress >= 100) {
        cur[id].progress = 100;
        cur[id].status = 'COMPLETED';
        clearInterval(interval);
        dispatchStatusChange(id, 'COMPLETED');
      } else {
        cur[id].progress = progress;
        dispatchProgress(id, progress);
      }
      saveDownloadsData(cur);
    }, 600);
  },

  async pause(id) {
    const data = getDownloadsData();
    if (data[id] && data[id].status === 'DOWNLOADING') {
      data[id].status = 'PAUSED';
      saveDownloadsData(data);
      dispatchStatusChange(id, 'PAUSED');
    }
  },

  async resume(id) {
    const data = getDownloadsData();
    if (data[id] && data[id].status === 'PAUSED') {
      const { type, title, posterPath } = data[id];
      data[id].status = 'DOWNLOADING';
      saveDownloadsData(data);
      dispatchStatusChange(id, 'DOWNLOADING');
      this.start(id, type, title, posterPath);
    }
  },

  async remove(id) {
    const data = getDownloadsData();
    const item = data[id];
    if (!item) return;

    if (Capacitor.isNativePlatform() && item.fileName) {
      try {
        await Filesystem.deleteFile({ path: item.fileName, directory: Directory.Data });
      } catch (e) {
        console.warn('[DownloadManager] File already removed:', e.message);
      }
    }

    delete data[id];
    saveDownloadsData(data);
    dispatchStatusChange(id, 'IDLE');
  },

  async getStatus(id) {
    const data = getDownloadsData();
    return data[id]
      ? { status: data[id].status, progress: data[id].progress }
      : { status: 'IDLE', progress: 0 };
  },

  async list() {
    const data = getDownloadsData();
    return Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
  },

  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usage = est.usage || 0;
        const quota = est.quota || 0;
        const totalDisk = quota > 0 ? quota : 32 * 1024 * 1024 * 1024;
        const freeSpace = Math.max(0, totalDisk - usage);
        return { usage, quota: totalDisk, totalDisk, freeSpace, otherApps: Math.max(0, totalDisk * 0.35) };
      } catch (err) {}
    }
    const total = 32 * 1024 * 1024 * 1024;
    return { usage: 2e9, quota: total, totalDisk: total, freeSpace: 28e9, otherApps: 2e9 };
  },

  async getOfflineUrl(id) {
    const data = getDownloadsData();
    const item = data[id];
    if (!item || item.status !== 'COMPLETED' || !item.fileName) return null;

    if (Capacitor.isNativePlatform()) {
      try {
        const uri = await Filesystem.getUri({ path: item.fileName, directory: Directory.Data });
        return Capacitor.convertFileSrc(uri.uri);
      } catch (e) {
        console.error('[DownloadManager] Failed to get URI:', e);
        return null;
      }
    }
    return null;
  }
};

// Fast base64 encoder for binary data (avoids btoa limitations)
function _uint8ArrayToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
