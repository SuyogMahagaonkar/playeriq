// ========================================
// PlayerIQ — Native Offline Download Manager (Capacitor v8)
// Production-level: fetches real stream URL from API before downloading
// ========================================

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { NODE_PROXY } from './api.js';

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
  // Core: resolve real stream URL → stream-download → save
  // id format: "movie_12345" or "tv_12345_s1_e1"
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
    if (data[id] && data[id].status === 'DOWNLOADING') {
      alert(`"${title}" is already downloading...`);
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

    try {
      // Step 1: Resolve the actual stream URL from our production API
      const streamUrl = await this._resolveStreamUrl(id, type);

      // Step 2: Stream-download it with real-time progress
      await this._streamDownload(id, streamUrl, fileName);

    } catch (e) {
      console.error('[DownloadManager] Download failed:', e.message || e);

      // Show a helpful error message
      const msg = e.message?.includes('403') ? 'Stream URL not accessible. Try again later.' :
                  e.message?.includes('404') ? 'Content not found on server.' :
                  e.message?.includes('Failed to fetch') ? 'No internet connection.' :
                  e.message || 'Download failed. Please try again.';

      alert(`Download failed: ${msg}`);

      const cur = getDownloadsData();
      if (cur[id]) {
        cur[id].status = 'ERROR';
        saveDownloadsData(cur);
        dispatchStatusChange(id, 'ERROR');
      }
    }
  },

  // Resolve the real downloadable MP4 URL from our API
  async _resolveStreamUrl(id, type) {
    let endpoint = '';

    if (type === 'movie' || id.startsWith('movie_')) {
      const tmdbId = id.replace('movie_', '');
      endpoint = `${NODE_PROXY}/api/stream/movie/${tmdbId}`;
    } else if (type === 'tv' || id.startsWith('tv_')) {
      // tv_12345_s1_e1
      const match = id.match(/^tv_(.+)_s(\d+)_e(\d+)$/);
      if (match) {
        const [, tmdbId, season, episode] = match;
        endpoint = `${NODE_PROXY}/api/stream/tv/${tmdbId}/${season}/${episode}`;
      } else {
        throw new Error('Invalid TV download ID format');
      }
    } else {
      throw new Error('Unknown content type for download');
    }

    console.log(`[DownloadManager] Fetching stream from: ${endpoint}`);
    const res = await fetch(endpoint, {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) throw new Error(`API error: HTTP ${res.status}`);

    const streamData = await res.json();

    // Get the best direct MP4 URL
    let url = streamData.url || '';

    // If API returned a relative /api/ path, make it absolute
    if (url.startsWith('/api/')) {
      url = `${NODE_PROXY}${url}`;
    }

    // Prefer direct MP4 from all_streams if available
    if (Array.isArray(streamData.all_streams) && streamData.all_streams.length > 0) {
      const mp4Stream = streamData.all_streams.find(s => 
        s.url && !s.url.includes('.m3u8') && (s.url.includes('.mp4') || s.type === 'mp4')
      );
      if (mp4Stream) {
        let mp4Url = mp4Stream.url;
        if (mp4Url.startsWith('/api/')) mp4Url = `${NODE_PROXY}${mp4Url}`;
        url = mp4Url;
      }
    }

    if (!url) throw new Error('No downloadable stream URL from API');

    console.log(`[DownloadManager] Stream URL resolved: ${url.substring(0, 80)}...`);
    return url;
  },

  // Streaming fetch with real-time chunk-by-chunk progress
  async _streamDownload(id, url, fileName) {
    console.log(`[DownloadManager] Downloading: ${url.substring(0, 80)}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'video/mp4,video/*,*/*;q=0.9' }
    });

    if (!response.ok) throw new Error(`Server error: HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();

    let receivedBytes = 0;
    const chunks = [];
    let lastPct = -1;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Check if download was cancelled
      const cur = getDownloadsData();
      if (!cur[id] || cur[id].status !== 'DOWNLOADING') {
        reader.cancel();
        break;
      }

      chunks.push(value);
      receivedBytes += value.length;

      const pct = contentLength > 0
        ? Math.min(99, Math.round((receivedBytes / contentLength) * 100))
        : Math.min(99, Math.round((receivedBytes / (50 * 1024 * 1024)) * 100));

      if (pct !== lastPct) {
        lastPct = pct;
        const curData = getDownloadsData();
        if (curData[id]) {
          curData[id].progress = pct;
          curData[id].totalSize = contentLength || receivedBytes;
          saveDownloadsData(curData);
          dispatchProgress(id, pct);
        }
      }
    }

    // Combine all chunks
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const allBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      allBytes.set(chunk, offset);
      offset += chunk.length;
    }

    // Write to native filesystem as base64
    const base64 = _uint8ArrayToBase64(allBytes);
    const writeResult = await Filesystem.writeFile({
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
      cur[id].localPath = writeResult.uri;
      saveDownloadsData(cur);
      dispatchProgress(id, 100, 'COMPLETED');
      dispatchStatusChange(id, 'COMPLETED');
    }

    console.log(`[DownloadManager] ✅ Saved: ${fileName} (${(totalLength / 1024 / 1024).toFixed(1)} MB)`);
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
        return { usage, quota: totalDisk, totalDisk, freeSpace };
      } catch (err) {}
    }
    const total = 32 * 1024 * 1024 * 1024;
    return { usage: 2e9, quota: total, totalDisk: total, freeSpace: 28e9 };
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

// Efficient base64 encoder for binary Uint8Array
function _uint8ArrayToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
