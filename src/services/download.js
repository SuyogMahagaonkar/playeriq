// ========================================
// PlayerIQ — Native Offline Download Manager (Capacitor v8)
// Production-level: fetches real stream URL from API before downloading
// ========================================

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
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

const DB_NAME = 'playeriq_web_downloads';
const STORE_NAME = 'videos';
const activeWebDownloads = {}; // id -> AbortController

function _openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function _saveVideoToDB(id, blob) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function _getVideoFromDB(id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function _deleteVideoFromDB(id) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
      this.realWebDownload(id, type, title, posterPath);
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

      // Step 2: Stream-download it with real-time progress natively
      await this._nativeDownload(id, streamUrl, fileName);

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

  // Native high-speed download using @capacitor/file-transfer
  async _nativeDownload(id, url, fileName) {
    console.log(`[DownloadManager] Starting native download: ${url.substring(0, 80)}`);

    // Get the destination URI using Filesystem
    const uriResult = await Filesystem.getUri({
      path: fileName,
      directory: Directory.Data
    });
    const targetPath = uriResult.uri;

    // Delete existing file if any, to avoid conflicts
    try {
      await Filesystem.deleteFile({
        path: fileName,
        directory: Directory.Data
      });
    } catch (e) {}

    // Add progress listener
    let progressListener = null;
    try {
      progressListener = await FileTransfer.addListener('progress', (progress) => {
        const bytes = Number(progress.bytes) || 0;
        let total = Number(progress.contentLength) || 0;

        // Fallback if contentLength is missing or invalid
        if (total <= 0) {
          const isTv = id.startsWith('tv_');
          // Standard estimate: 80MB for TV, 300MB for Movie
          total = isTv ? 80 * 1024 * 1024 : 300 * 1024 * 1024;
        }

        const pct = Math.min(98, Math.round((bytes / total) * 100));
        const cur = getDownloadsData();
        if (cur[id] && cur[id].status === 'DOWNLOADING') {
          cur[id].progress = pct;
          cur[id].totalSize = total;
          saveDownloadsData(cur);
          dispatchProgress(id, pct);
        }
      });
    } catch (err) {
      console.warn('[DownloadManager] Progress listener failed to register:', err);
    }

    try {
      // Start download using official absolute path parameter
      await FileTransfer.downloadFile({
        url: url,
        path: targetPath,
        progress: true
      });

      // Show "Saving…" state briefly
      const savingData = getDownloadsData();
      if (savingData[id]) {
        savingData[id].progress = 99;
        savingData[id].status = 'SAVING';
        saveDownloadsData(savingData);
        dispatchProgress(id, 99, 'SAVING');
        dispatchStatusChange(id, 'SAVING');
      }

      // Mark complete after a short 500ms delay to resolve the asynchronous UI race condition
      await new Promise(resolve => setTimeout(resolve, 500));

      const finalData = getDownloadsData();
      if (finalData[id]) {
        finalData[id].status = 'COMPLETED';
        finalData[id].progress = 100;
        finalData[id].localPath = targetPath;
        saveDownloadsData(finalData);
        dispatchProgress(id, 100, 'COMPLETED');
        dispatchStatusChange(id, 'COMPLETED');
      }
      console.log(`[DownloadManager] ✅ Native download completed for ${fileName}`);

    } catch (downloadErr) {
      console.error('[DownloadManager] Native download error:', downloadErr);
      throw downloadErr;
    } finally {
      // Clean up progress listener
      if (progressListener) {
        progressListener.remove();
      }
    }
  },


  // Real browser download using chunked streams and IndexedDB storage
  async realWebDownload(id, type, title, posterPath) {
    const data = getDownloadsData();
    if (data[id] && data[id].status === 'COMPLETED') return;

    data[id] = {
      id, type, title, posterPath,
      progress: 0,
      status: 'DOWNLOADING',
      totalSize: 0,
      timestamp: Date.now()
    };
    saveDownloadsData(data);
    dispatchStatusChange(id, 'DOWNLOADING');

    const controller = new AbortController();
    activeWebDownloads[id] = controller;

    try {
      // Step 1: Resolve the actual stream URL from our production API
      const streamUrl = await this._resolveStreamUrl(id, type);

      // Step 2: Fetch and read chunks via stream reader
      const response = await fetch(streamUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length') || 0;

      let receivedLength = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const pct = contentLength > 0 ? Math.min(99, Math.round((receivedLength / contentLength) * 100)) : 50;

        // Save incremental progress
        const cur = getDownloadsData();
        if (cur[id] && cur[id].status === 'DOWNLOADING') {
          cur[id].progress = pct;
          cur[id].totalSize = contentLength;
          saveDownloadsData(cur);
          dispatchProgress(id, pct);
        }
      }

      // Show "Saving…" state briefly
      const savingData = getDownloadsData();
      if (savingData[id]) {
        savingData[id].progress = 99;
        savingData[id].status = 'SAVING';
        saveDownloadsData(savingData);
        dispatchProgress(id, 99, 'SAVING');
        dispatchStatusChange(id, 'SAVING');
      }

      // Step 3: Combine chunks and store in IndexedDB
      const videoBlob = new Blob(chunks, { type: 'video/mp4' });
      await _saveVideoToDB(id, videoBlob);

      // Mark complete
      const finalData = getDownloadsData();
      if (finalData[id]) {
        finalData[id].status = 'COMPLETED';
        finalData[id].progress = 100;
        saveDownloadsData(finalData);
        dispatchProgress(id, 100, 'COMPLETED');
        dispatchStatusChange(id, 'COMPLETED');
      }

    } catch (e) {
      if (e.name === 'AbortError') {
        console.log(`[DownloadManager] Web download paused/aborted: ${id}`);
        return;
      }
      console.error('[DownloadManager] Desktop download failed:', e);
      alert(`Download failed: ${e.message || e}`);
      const cur = getDownloadsData();
      if (cur[id]) {
        cur[id].status = 'ERROR';
        saveDownloadsData(cur);
        dispatchStatusChange(id, 'ERROR');
      }
    } finally {
      delete activeWebDownloads[id];
    }
  },

  async pause(id) {
    const data = getDownloadsData();
    if (data[id] && data[id].status === 'DOWNLOADING') {
      data[id].status = 'PAUSED';
      saveDownloadsData(data);
      dispatchStatusChange(id, 'PAUSED');
      if (activeWebDownloads[id]) {
        activeWebDownloads[id].abort();
        delete activeWebDownloads[id];
      }
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
    } else if (!Capacitor.isNativePlatform()) {
      try {
        await _deleteVideoFromDB(id);
      } catch (e) {
        console.warn('[DownloadManager] Failed to delete video from DB:', e);
      }
      if (activeWebDownloads[id]) {
        activeWebDownloads[id].abort();
        delete activeWebDownloads[id];
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
    if (!item || item.status !== 'COMPLETED') return null;

    if (Capacitor.isNativePlatform()) {
      if (!item.fileName) return null;
      try {
        const uri = await Filesystem.getUri({ path: item.fileName, directory: Directory.Data });
        return Capacitor.convertFileSrc(uri.uri);
      } catch (e) {
        console.error('[DownloadManager] Failed to get URI:', e);
        return null;
      }
    } else {
      try {
        const blob = await _getVideoFromDB(id);
        if (blob) {
          return URL.createObjectURL(blob);
        }
      } catch (e) {
        console.error('[DownloadManager] Failed to get local video blob:', e);
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
