// ========================================
// PlayerIQ — Native Offline Download Manager (Capacitor v8)
// Uses @capacitor/file-transfer for native Android/iOS downloads
// ========================================

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const DOWNLOADS_KEY = 'piq_native_downloads';

// Lazily import FileTransfer only on native to avoid web errors
let _FileTransfer = null;
async function getFileTransfer() {
  if (_FileTransfer) return _FileTransfer;
  try {
    const mod = await import('@capacitor/file-transfer');
    _FileTransfer = mod.FileTransfer;
    return _FileTransfer;
  } catch (e) {
    console.warn('[DownloadManager] @capacitor/file-transfer not available:', e);
    return null;
  }
}

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

export const DownloadManager = {
  async getSettings() {
    return { wifiOnly: true, quality: 'standard' };
  },

  async setSetting(key, value) {
    return true;
  },

  async start(id, type, title, posterPath) {
    console.log(`[DownloadManager] Starting download: ${title} (${id})`);

    if (!Capacitor.isNativePlatform()) {
      // Web: use mock animation
      this.mockWebDownload(id, type, title, posterPath);
      return;
    }

    const data = getDownloadsData();
    if (data[id] && data[id].status === 'COMPLETED') {
      alert(`"${title}" is already downloaded!`);
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
    window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'DOWNLOADING' } }));

    // Sample MP4 URL (replace with actual media URL when integrating with the real API)
    const mp4Url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

    try {
      // Try @capacitor/file-transfer first (official Capacitor v8 API)
      const FileTransfer = await getFileTransfer();

      if (FileTransfer) {
        console.log('[DownloadManager] Using FileTransfer plugin...');

        // Add progress listener
        const progressHandle = await FileTransfer.addListener('progress', (progress) => {
          if (progress.url !== mp4Url) return;
          const pct = progress.contentLength > 0
            ? Math.round((progress.bytes / progress.contentLength) * 100)
            : 0;
          const cur = getDownloadsData();
          if (cur[id] && cur[id].status === 'DOWNLOADING') {
            cur[id].progress = pct;
            cur[id].totalSize = progress.contentLength;
            saveDownloadsData(cur);
            window.dispatchEvent(new CustomEvent('download-progress', { detail: { id, progress: pct, status: 'DOWNLOADING' } }));
          }
        });

        const res = await FileTransfer.downloadFile({
          url: mp4Url,
          path: fileName,
          directory: Directory.Data,
          progress: true
        });

        progressHandle.remove();

        const current = getDownloadsData();
        if (current[id]) {
          current[id].status = 'COMPLETED';
          current[id].progress = 100;
          current[id].localPath = res.path;
          saveDownloadsData(current);
          window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'COMPLETED' } }));
        }
        return;
      }

      // Fallback: fetch as blob → base64 → Filesystem.writeFile
      console.log('[DownloadManager] FileTransfer unavailable, using fetch fallback...');
      await this._fetchAndWriteFallback(id, mp4Url, fileName);

    } catch (e) {
      console.error('[DownloadManager] Download failed:', e.message || e);
      alert(`Download failed: ${e.message || 'Unknown error. Please try again.'}`);
      const current = getDownloadsData();
      if (current[id]) {
        current[id].status = 'ERROR';
        saveDownloadsData(current);
        window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'ERROR' } }));
      }
    }
  },

  // Fallback: fetch binary → base64 → write file
  async _fetchAndWriteFallback(id, url, fileName) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get('content-length')) || 0;
    let receivedBytes = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.length;
      const pct = contentLength > 0 ? Math.round((receivedBytes / contentLength) * 100) : 0;
      const cur = getDownloadsData();
      if (cur[id]) {
        cur[id].progress = pct;
        saveDownloadsData(cur);
        window.dispatchEvent(new CustomEvent('download-progress', { detail: { id, progress: pct, status: 'DOWNLOADING' } }));
      }
    }

    // Convert to base64
    const blob = new Blob(chunks);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Data,
      recursive: true
    });

    const current = getDownloadsData();
    if (current[id]) {
      current[id].status = 'COMPLETED';
      current[id].progress = 100;
      current[id].localPath = writeResult.uri;
      saveDownloadsData(current);
      window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'COMPLETED' } }));
    }
  },

  // Web mock for browser testing
  mockWebDownload(id, type, title, posterPath) {
    const data = getDownloadsData();
    data[id] = { id, type, title, posterPath, progress: 0, status: 'DOWNLOADING', timestamp: Date.now() };
    saveDownloadsData(data);

    let progress = 0;
    const interval = setInterval(() => {
      const current = getDownloadsData();
      if (!current[id] || current[id].status !== 'DOWNLOADING') {
        clearInterval(interval);
        return;
      }
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress >= 100) {
        progress = 100;
        current[id].progress = 100;
        current[id].status = 'COMPLETED';
        clearInterval(interval);
        window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'COMPLETED' } }));
      } else {
        current[id].progress = progress;
        window.dispatchEvent(new CustomEvent('download-progress', { detail: { id, progress, status: 'DOWNLOADING' } }));
      }
      saveDownloadsData(current);
    }, 800);
  },

  async pause(id) {
    const data = getDownloadsData();
    if (data[id] && data[id].status === 'DOWNLOADING') {
      data[id].status = 'PAUSED';
      saveDownloadsData(data);
      window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'PAUSED' } }));
    }
  },

  async resume(id) {
    const data = getDownloadsData();
    if (data[id] && data[id].status === 'PAUSED') {
      data[id].status = 'DOWNLOADING';
      saveDownloadsData(data);
      window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'DOWNLOADING' } }));
      this.start(id, data[id].type, data[id].title, data[id].posterPath);
    }
  },

  async remove(id) {
    const data = getDownloadsData();
    const item = data[id];
    if (!item) return;

    if (Capacitor.isNativePlatform() && item.fileName) {
      try {
        await Filesystem.deleteFile({
          path: item.fileName,
          directory: Directory.Data
        });
      } catch (e) {
        console.warn('[DownloadManager] File already gone:', e.message);
      }
    }

    delete data[id];
    saveDownloadsData(data);
    window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'IDLE' } }));
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
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const totalDisk = quota > 0 ? quota : 32 * 1024 * 1024 * 1024;
        const freeSpace = Math.max(0, totalDisk - usage);
        const otherApps = Math.max(0, totalDisk * 0.4 - usage);
        return { usage, quota: totalDisk, totalDisk, freeSpace, otherApps };
      } catch (err) {
        console.warn('Storage estimate failed', err);
      }
    }
    const totalDisk = 32 * 1024 * 1024 * 1024;
    return { usage: 2 * 1024 * 1024 * 1024, quota: totalDisk, totalDisk, freeSpace: 28 * 1024 * 1024 * 1024, otherApps: 2 * 1024 * 1024 * 1024 };
  },

  async getOfflineUrl(id) {
    const data = getDownloadsData();
    const item = data[id];
    if (!item || item.status !== 'COMPLETED' || !item.fileName) return null;

    if (Capacitor.isNativePlatform()) {
      try {
        const uri = await Filesystem.getUri({
          path: item.fileName,
          directory: Directory.Data
        });
        return Capacitor.convertFileSrc(uri.uri);
      } catch (e) {
        console.error('[DownloadManager] Failed to get offline URI:', e);
        return null;
      }
    }
    return null;
  }
};
