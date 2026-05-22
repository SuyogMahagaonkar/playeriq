// ========================================
// PlayerIQ — Premium Offline Download Manager
// ========================================

const DB_NAME = 'playeriq_downloads_db';
const DB_VERSION = 1;

let dbInstance = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error('[Download DB] Error opening database:', e);
      reject(e);
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('segments')) {
        db.createObjectStore('segments', { keyPath: 'segmentKey' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// Helper to access stores
async function getStore(storeName, mode = 'readonly') {
  const db = await initDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// Active abort controllers for pause/resume indexed by download ID
const activeControllers = {};

export const DownloadManager = {
  // --- Settings ---
  async getSettings() {
    try {
      const store = await getStore('settings', 'readonly');
      return new Promise((resolve) => {
        const reqWifi = store.get('wifiOnly');
        const reqQuality = store.get('quality');
        
        let wifi = true;
        let quality = 'standard';
        
        reqWifi.onsuccess = () => {
          if (reqWifi.result) wifi = reqWifi.result.value;
          reqQuality.onsuccess = () => {
            if (reqQuality.result) quality = reqQuality.result.value;
            resolve({ wifiOnly: wifi, quality });
          };
        };
        reqWifi.onerror = reqQuality.onerror = () => {
          resolve({ wifiOnly: wifi, quality });
        };
      });
    } catch (e) {
      return { wifiOnly: true, quality: 'standard' };
    }
  },

  async setSetting(key, value) {
    const db = await initDB();
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    store.put({ key, value });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  // --- Core Lifecycle ---
  async start(id, type, title, posterPath) {
    console.log(`[DownloadManager] Starting download for: ${title} (${id})`);
    
    // 1. Authenticate download on the server
    let licenseToken = '';
    let licenseExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days default
    
    try {
      const authRes = await fetch('/api/download/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type })
      });
      if (authRes.ok) {
        const authData = await authRes.json();
        licenseToken = authData.token || 'mock-signed-jwt';
        if (authData.expiresAt) {
          licenseExpiresAt = authData.expiresAt;
        }
      }
    } catch (err) {
      console.warn('[DownloadManager] Server authentication offline/failed, using local fallback token', err);
      licenseToken = 'local-fallback-token-' + Math.random().toString(36).substr(2, 9);
    }

    // 2. Fetch manifest / simulator parameters
    let totalSegments = 40; // Simulated number of segments
    let segmentSize = type === 'movie' ? 4 * 1024 * 1024 : 1.5 * 1024 * 1024; // 4MB or 1.5MB
    const settings = await this.getSettings();
    if (settings.quality === 'high') {
      segmentSize *= 2.5; // High quality is larger
    }

    const totalSize = totalSegments * segmentSize;

    // Check storage constraints first
    const storageEst = await this.getStorageEstimate();
    if (storageEst.freeSpace < totalSize && storageEst.freeSpace > 0) {
      throw new Error('Insufficient storage space to download this title.');
    }

    // Create metadata record
    const downloadRecord = {
      id,
      type,
      title,
      posterPath,
      progress: 0,
      status: 'DOWNLOADING',
      totalSegments,
      downloadedSegments: 0,
      segmentSize,
      totalSize,
      addedAt: Date.now(),
      wifiOnly: settings.wifiOnly,
      quality: settings.quality,
      licenseExpiresAt,
      licenseToken
    };

    const db = await initDB();
    const tx = db.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put(downloadRecord);
    
    // Telemetry
    this.dispatchTelemetry('download_started', { id, type, title, quality: settings.quality });

    // Spawn download runner
    this.runDownloadLoop(id);
  },

  async runDownloadLoop(id) {
    const db = await initDB();
    
    // Get metadata
    let metadata = await new Promise((resolve) => {
      const req = db.transaction('metadata', 'readonly').objectStore('metadata').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (!metadata || metadata.status !== 'DOWNLOADING') return;

    // Create abort controller for segment fetchers
    const controller = new AbortController();
    activeControllers[id] = controller;

    const { totalSegments, downloadedSegments } = metadata;
    let current = downloadedSegments;

    // Simulate Parallel Workers (e.g. 6 workers downloading chunks)
    const workerCount = 6;
    let activeWorkers = 0;
    let failed = false;

    const downloadNextSegment = async () => {
      if (current >= totalSegments || failed || controller.signal.aborted) return;
      
      const segmentIndex = current++;
      activeWorkers++;

      try {
        // Simulation delay resembling actual segment fetches
        const downloadTime = 300 + Math.random() * 400; // 300-700ms
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, downloadTime);
          controller.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Aborted'));
          });
        });

        // Store a simulated segment chunk (ArrayBuffer of dummy data)
        const dummyBuffer = new ArrayBuffer(metadata.segmentSize);
        const segmentKey = `${id}_${segmentIndex}`;

        const txSeg = db.transaction('segments', 'readwrite');
        txSeg.objectStore('segments').put({
          segmentKey,
          id,
          index: segmentIndex,
          data: dummyBuffer
        });

        await new Promise((resolve) => {
          txSeg.oncomplete = resolve;
          txSeg.onerror = () => reject(new Error('IndexedDB Write Failed'));
        });

        // Update progress in metadata
        const txMeta = db.transaction('metadata', 'readwrite');
        const metaStore = txMeta.objectStore('metadata');
        
        metadata = await new Promise((res) => {
          metaStore.get(id).onsuccess = (e) => res(e.target.result);
        });

        if (metadata && metadata.status === 'DOWNLOADING') {
          metadata.downloadedSegments++;
          metadata.progress = Math.round((metadata.downloadedSegments / totalSegments) * 100);
          
          if (metadata.downloadedSegments >= totalSegments) {
            metadata.status = 'COMPLETED';
          }
          
          metaStore.put(metadata);
          await new Promise((res) => { txMeta.oncomplete = res; });
          
          // Dispatch live progress update event for reactive UI
          window.dispatchEvent(new CustomEvent('download-progress', {
            detail: { id, progress: metadata.progress, status: metadata.status }
          }));
          
          this.dispatchTelemetry('download_progress', { id, progress: metadata.progress });
        }
      } catch (err) {
        if (err.message !== 'Aborted') {
          console.error(`[DownloadManager] Error downloading segment ${segmentIndex}`, err);
          failed = true;
        }
      } finally {
        activeWorkers--;
        // Trigger next segment download
        if (!failed && !controller.signal.aborted) {
          downloadNextSegment();
        }
      }
    };

    // Spawn workers
    for (let i = 0; i < workerCount; i++) {
      downloadNextSegment();
    }

    // Monitor complete/error
    const checkInterval = setInterval(async () => {
      const meta = await new Promise((res) => {
        const req = db.transaction('metadata', 'readonly').objectStore('metadata').get(id);
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });

      if (!meta || meta.status !== 'DOWNLOADING' || controller.signal.aborted) {
        clearInterval(checkInterval);
        delete activeControllers[id];
        
        if (meta?.status === 'COMPLETED') {
          this.dispatchTelemetry('download_completed', { id, title: meta.title });
          window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'COMPLETED' } }));
        }
        return;
      }

      if (failed) {
        clearInterval(checkInterval);
        delete activeControllers[id];
        
        const txMeta = db.transaction('metadata', 'readwrite');
        meta.status = 'PAUSED';
        txMeta.objectStore('metadata').put(meta);
        
        window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'PAUSED' } }));
        this.dispatchTelemetry('download_failed', { id, reason: 'network_or_storage_error' });
      }
    }, 500);
  },

  async pause(id) {
    if (activeControllers[id]) {
      activeControllers[id].abort();
      delete activeControllers[id];
    }

    const db = await initDB();
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');
    
    const meta = await new Promise((res) => {
      store.get(id).onsuccess = (e) => res(e.target.result);
    });

    if (meta && meta.status === 'DOWNLOADING') {
      meta.status = 'PAUSED';
      store.put(meta);
      await new Promise((res) => { tx.oncomplete = res; });
      
      window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'PAUSED' } }));
      this.dispatchTelemetry('download_paused', { id });
    }
  },

  async resume(id) {
    const db = await initDB();
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');
    
    const meta = await new Promise((res) => {
      store.get(id).onsuccess = (e) => res(e.target.result);
    });

    if (meta && (meta.status === 'PAUSED' || meta.status === 'ERROR')) {
      meta.status = 'DOWNLOADING';
      store.put(meta);
      await new Promise((res) => { tx.oncomplete = res; });
      
      window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'DOWNLOADING' } }));
      
      // Spawn download runner again
      this.runDownloadLoop(id);
    }
  },

  async remove(id) {
    if (activeControllers[id]) {
      activeControllers[id].abort();
      delete activeControllers[id];
    }

    const db = await initDB();
    
    // Revoke license on backend if token exists
    try {
      const meta = await new Promise((res) => {
        db.transaction('metadata', 'readonly').objectStore('metadata').get(id).onsuccess = (e) => res(e.target.result);
      });
      if (meta && meta.licenseToken) {
        fetch('/api/download/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, token: meta.licenseToken })
        }).catch(() => {});
      }
    } catch (e) {}

    // Delete metadata
    const txMeta = db.transaction('metadata', 'readwrite');
    txMeta.objectStore('metadata').delete(id);
    await new Promise((res) => { txMeta.oncomplete = res; });

    // Delete segments associated with this ID
    const txSeg = db.transaction('segments', 'readwrite');
    const segStore = txSeg.objectStore('segments');
    
    // Simple deletion loop of expected segment keys
    // (Up to 40 or typical cap just to clean up)
    for (let i = 0; i < 100; i++) {
      segStore.delete(`${id}_${i}`);
    }
    
    await new Promise((res) => { txSeg.oncomplete = res; });

    window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'IDLE' } }));
    this.dispatchTelemetry('download_removed', { id });
  },

  async getStatus(id) {
    try {
      const db = await initDB();
      const meta = await new Promise((resolve) => {
        const req = db.transaction('metadata', 'readonly').objectStore('metadata').get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });

      if (!meta) return { status: 'IDLE', progress: 0 };

      // Check DRM License expiry
      if (meta.status === 'COMPLETED' && Date.now() > meta.licenseExpiresAt) {
        meta.status = 'EXPIRED';
        const tx = db.transaction('metadata', 'readwrite');
        tx.objectStore('metadata').put(meta);
        await new Promise((res) => { tx.oncomplete = res; });
      }

      return {
        status: meta.status,
        progress: meta.progress,
        licenseExpiresAt: meta.licenseExpiresAt,
        totalSize: meta.totalSize
      };
    } catch (e) {
      return { status: 'IDLE', progress: 0 };
    }
  },

  async list() {
    try {
      const db = await initDB();
      return new Promise((resolve) => {
        const tx = db.transaction('metadata', 'readonly');
        const req = tx.objectStore('metadata').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  },

  async reauthorizeLicense(id) {
    console.log(`[DownloadManager] Re-authorizing license for ${id}`);
    const db = await initDB();
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');
    
    const meta = await new Promise((res) => {
      store.get(id).onsuccess = (e) => res(e.target.result);
    });

    if (!meta) return false;

    try {
      const authRes = await fetch('/api/download/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type: meta.type })
      });
      if (authRes.ok) {
        const authData = await authRes.json();
        meta.licenseToken = authData.token || 'mock-jwt-extended';
        meta.licenseExpiresAt = authData.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000);
        meta.status = 'COMPLETED'; // Restore status if it was expired
        
        store.put(meta);
        await new Promise((res) => { tx.oncomplete = res; });
        
        window.dispatchEvent(new CustomEvent('download-status-change', { detail: { id, status: 'COMPLETED' } }));
        return true;
      }
    } catch (e) {
      console.error('[DownloadManager] Failed re-auth license', e);
    }
    return false;
  },

  // --- Storage Stats ---
  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        
        // For premium UI visualization, let's simulate realistic disk spaces
        // browser quota might be large (like 100GB), but mobile devices have smaller capacities.
        const totalDisk = 64 * 1024 * 1024 * 1024; // 64 GB typical phone
        const freeSpace = Math.max(0, quota - usage);
        
        return {
          usage,
          quota,
          freeSpace,
          otherApps: totalDisk - quota,
          totalDisk
        };
      } catch (err) {}
    }
    
    // Mock robust fallback estimates if api is blocked/unsupported
    const mockUsage = 1.2 * 1024 * 1024 * 1024; // 1.2 GB
    const mockTotal = 64 * 1024 * 1024 * 1024; // 64 GB
    const mockFree = 18.5 * 1024 * 1024 * 1024; // 18.5 GB
    return {
      usage: mockUsage,
      quota: mockTotal - mockFree,
      freeSpace: mockFree,
      otherApps: mockTotal - mockFree - mockUsage,
      totalDisk: mockTotal
    };
  },

  // --- Telemetry batch dispatcher helper ---
  dispatchTelemetry(event, payload) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => {
        this.sendTelemetryEvent(event, payload);
      });
    } else {
      setTimeout(() => {
        this.sendTelemetryEvent(event, payload);
      }, 0);
    }
  },

  sendTelemetryEvent(event, payload) {
    if (!window.playeriqTelemetry) {
      window.playeriqTelemetry = [];
    }
    const telemetryRecord = {
      event,
      timestamp: Date.now(),
      payload,
      viewport: `${window.innerWidth}x${window.innerHeight}`
    };
    window.playeriqTelemetry.push(telemetryRecord);
    console.log(`[Telemetry Dispatch]`, telemetryRecord);
  }
};
