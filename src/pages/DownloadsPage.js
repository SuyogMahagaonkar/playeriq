import { DownloadManager } from '../services/download.js';
import { Capacitor } from '@capacitor/core';
import { updateSidebarActive } from '../components/Sidebar.js';

export function renderDownloadsPage(ctx) {
  const container = document.getElementById('app') || document.getElementById('page-content') || document.body;
  container.innerHTML = '';
  window.scrollTo(0, 0);
  updateSidebarActive?.();

  if (!Capacitor.isNativePlatform()) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;text-align:center;padding:2rem;">
        <div style="font-size:4rem;margin-bottom:1rem;">📲</div>
        <h2 style="color:var(--text-primary);margin-bottom:0.5rem;">Android App Required</h2>
        <p style="color:var(--text-secondary);max-width:360px;">Offline downloads are only available in the native Android APK for secure sandboxed playback.</p>
      </div>
    `;
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding: 1rem; max-width: 700px; margin: 0 auto;';

  // Header
  wrapper.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;padding-top:0.5rem;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <h1 style="margin:0;font-size:1.4rem;color:var(--text-primary);font-weight:700;">My Downloads</h1>
    </div>
    <div id="storage-bar-wrapper" style="margin-bottom:1.5rem;padding:1rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;display:none;"></div>
    <div id="downloads-list-area"></div>
  `;
  container.appendChild(wrapper);

  const storageWrapper = wrapper.querySelector('#storage-bar-wrapper');
  const listArea = wrapper.querySelector('#downloads-list-area');

  // ---- Storage bar (rendered once, no re-render on progress) ----
  async function renderStorageBar() {
    try {
      const est = await DownloadManager.getStorageEstimate();
      const fmt = (b) => (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
      const usedPct = Math.min(100, Math.round((est.usage / est.totalDisk) * 100));
      storageWrapper.style.display = 'block';
      storageWrapper.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:0.82rem;color:var(--text-secondary);">
          <span><strong style="color:var(--text-primary);">${fmt(est.usage)}</strong> PlayerIQ</span>
          <span><strong style="color:var(--text-primary);">${fmt(est.freeSpace)}</strong> Free</span>
        </div>
        <div style="width:100%;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
          <div style="width:${usedPct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--primary));border-radius:3px;"></div>
        </div>
      `;
    } catch (e) {}
  }
  renderStorageBar();

  // ---- Full list render (called initially and on item add/remove/complete) ----
  async function renderList() {
    const items = await DownloadManager.list();

    if (items.length === 0) {
      listArea.innerHTML = `
        <div style="text-align:center;padding:5rem 1rem;color:var(--text-secondary);">
          <div style="font-size:4rem;margin-bottom:1rem;">📥</div>
          <h2 style="color:var(--text-primary);margin-bottom:0.5rem;">No Downloads Yet</h2>
          <p style="margin-bottom:1.5rem;">Find a movie or show and tap the Download button.</p>
          <a href="#/" style="display:inline-block;padding:0.7rem 1.5rem;background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Browse Content</a>
        </div>
      `;
      return;
    }

    listArea.innerHTML = items.map(item => {
      const isComplete = item.status === 'COMPLETED';
      const isError = item.status === 'ERROR';
      const isPaused = item.status === 'PAUSED';
      const isDownloading = item.status === 'DOWNLOADING';
      const pct = item.progress || 0;
      const sizeMB = item.totalSize ? (item.totalSize / (1024 * 1024)).toFixed(0) + ' MB' : '';

      return `
        <div class="dl-card" data-id="${item.id}" style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;margin-bottom:14px;cursor:${isComplete?'pointer':'default'};transition:background 0.2s;">
          <img src="${item.posterPath || ''}" onerror="this.style.display='none'" style="width:80px;height:112px;object-fit:cover;border-radius:8px;flex-shrink:0;background:rgba(255,255,255,0.06);" alt="">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">${item.title}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;">${item.type === 'movie' ? 'Movie' : 'TV Episode'}${sizeMB ? ' · ' + sizeMB : ''}</div>

            ${isDownloading ? `
              <div class="dl-pct-label" style="font-size:0.78rem;color:var(--accent);font-weight:600;margin-bottom:5px;">Downloading… <span class="pct-num" id="pct-${item.id}">${pct}%</span></div>
              <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">
                <div class="dl-bar" id="bar-${item.id}" style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--primary));border-radius:2px;transition:width 0.4s ease;"></div>
              </div>
            ` : isComplete ? `
              <div style="font-size:0.78rem;color:#22c55e;font-weight:600;">✓ Downloaded · Ready to Watch</div>
            ` : isPaused ? `
              <div style="font-size:0.78rem;color:#f59e0b;font-weight:600;">⏸ Paused · ${pct}%</div>
            ` : `
              <div style="font-size:0.78rem;color:#ef4444;font-weight:600;">✕ Failed — Tap delete to retry</div>
            `}
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0;">
            ${isComplete ? `<button class="btn-play-dl" data-id="${item.id}" style="background:var(--accent);border:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </button>` : ''}
            <button class="btn-del-dl" data-id="${item.id}" data-title="${item.title}" style="background:transparent;border:none;padding:8px;cursor:pointer;color:rgba(255,255,255,0.4);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Wire play buttons — launch inside the custom PlayerPage player
    listArea.querySelectorAll('.btn-play-dl').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = items.find(x => x.id === id);
        if (!item) return;
        await launchInPlayer(item);
      });
    });

    // Wire card clicks — launch inside the custom PlayerPage player
    listArea.querySelectorAll('.dl-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.dataset.id;
        const item = items.find(x => x.id === id);
        if (!item || item.status !== 'COMPLETED') return;
        await launchInPlayer(item);
      });
    });

    // Wire delete buttons
    listArea.querySelectorAll('.btn-del-dl').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const title = btn.dataset.title || 'this item';
        if (confirm(`Remove "${title}" from downloads?`)) {
          await DownloadManager.remove(id);
          renderList();
          renderStorageBar();
        }
      });
    });
  }

  renderList();

  // ---- FAST in-place progress update (no full re-render!) ----
  const handleProgress = (e) => {
    const { id, progress } = e.detail || {};
    if (!id) return;

    // Update only the bar and label for this specific item
    const bar = document.getElementById(`bar-${id}`);
    const pctNum = document.getElementById(`pct-${id}`);
    if (bar) bar.style.width = `${progress}%`;
    if (pctNum) pctNum.textContent = `${progress}%`;
  };

  // ---- Full re-render only on status changes (complete / error / new item) ----
  const handleStatusChange = () => {
    renderList();
    renderStorageBar();
  };

  window.addEventListener('download-progress', handleProgress);
  window.addEventListener('download-status-change', handleStatusChange);
  window.addEventListener('downloadsUpdated', handleStatusChange);

  // Cleanup listeners when page is navigated away
  const observer = new MutationObserver(() => {
    if (!document.contains(wrapper)) {
      window.removeEventListener('download-progress', handleProgress);
      window.removeEventListener('download-status-change', handleStatusChange);
      window.removeEventListener('downloadsUpdated', handleStatusChange);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---- Launch downloaded item inside the full custom PlayerPage player ----
async function launchInPlayer(item) {
  const { id, type } = item;

  // Signal to PlayerPage to immediately use offline mode
  sessionStorage.setItem('piq_force_offline', '1');

  // Movie: "movie_12345"  → /watch/movie/12345
  // TV:    "tv_12345_s2_e5" → /watch/tv/12345?s=2&e=5
  if (type === 'movie' || id.startsWith('movie_')) {
    const tmdbId = id.replace('movie_', '');
    window.location.hash = `#/watch/movie/${tmdbId}`;
    return;
  }

  if (type === 'tv' || id.startsWith('tv_')) {
    const match = id.match(/^tv_(.+)_s(\d+)_e(\d+)$/);
    if (match) {
      const [, tmdbId, season, episode] = match;
      window.location.hash = `#/watch/tv/${tmdbId}?s=${season}&e=${episode}`;
    } else {
      const tmdbId = id.replace('tv_', '').split('_')[0];
      window.location.hash = `#/tv/${tmdbId}`;
    }
    return;
  }

  window.location.hash = '#/';
}
