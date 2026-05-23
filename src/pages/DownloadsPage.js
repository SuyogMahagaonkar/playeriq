// ========================================
// PlayerIQ — Downloads Page (YouTube-style Offline Library)
// ========================================

import { DownloadManager } from '../services/download.js';
import { isOnline } from '../services/connectivity.js';
import { Capacitor } from '@capacitor/core';
import { updateSidebarActive } from '../components/Sidebar.js';

// ---- Circumference for a 23px-radius progress ring ----
const RING_R      = 22;
const RING_CIRC   = 2 * Math.PI * RING_R; // ≈ 138.2

function _pct2offset(pct) {
  return RING_CIRC - (pct / 100) * RING_CIRC;
}

function _formatSize(bytes) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  return Math.round(bytes / (1024 * 1024)) + ' MB';
}

function _buildProgressRing(pct) {
  const offset = _pct2offset(pct);
  return `
    <div class="dl-progress-overlay">
      <div class="dl-progress-ring">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle class="ring-bg"   cx="26" cy="26" r="${RING_R}" />
          <circle class="ring-fill" id="ring-fill-__ID__"
            cx="26" cy="26" r="${RING_R}"
            stroke-dasharray="${RING_CIRC}"
            stroke-dashoffset="${offset}" />
        </svg>
        <span class="ring-text" id="ring-txt-__ID__">${pct}%</span>
      </div>
    </div>
  `;
}

function _cardHTML(item) {
  const { id, title, type, posterPath, progress = 0, status, totalSize } = item;
  const pct       = Math.round(progress || 0);
  const isReady   = status === 'COMPLETED';
  const isDl      = status === 'DOWNLOADING';
  const isSaving  = status === 'SAVING';
  const isError   = status === 'ERROR';
  const isPaused  = status === 'PAUSED';
  const sizeLabel = _formatSize(totalSize);
  const typeLabel = type === 'movie' ? 'Movie' : 'TV Episode';

  // Poster overlay
  let posterOverlay = '';
  if (isReady) {
    posterOverlay = `
      <div class="dl-play-overlay">
        <div class="dl-play-btn-inner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>
    `;
  } else if (isDl || isSaving) {
    const ringHTML = _buildProgressRing(isSaving ? 99 : pct)
      .replace(/__ID__/g, id.replace(/[^a-zA-Z0-9_-]/g, '_'));
    posterOverlay = ringHTML;
  }

  // Status section
  let statusHTML = '';
  if (isReady) {
    statusHTML = `<div class="dl-status-ready">Ready to Watch</div>`;
  } else if (isDl) {
    statusHTML = `
      <div class="dl-status-downloading">
        <div class="dl-pct-label">Downloading… <span id="pct-txt-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}">${pct}%</span></div>
        <div class="dl-progress-bar-track">
          <div class="dl-progress-bar-fill" id="bar-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  } else if (isSaving) {
    statusHTML = `<div class="dl-status-saving">⚙️ Saving file…</div>`;
  } else if (isPaused) {
    statusHTML = `<div class="dl-status-error">⏸ Paused at ${pct}%</div>`;
  } else if (isError) {
    statusHTML = `<div class="dl-status-error">✕ Download failed — delete &amp; retry</div>`;
  }

  return `
    <div class="dl-card-v2 ${isReady ? 'completed' : ''}" 
         data-id="${id}" 
         data-status="${status}"
         role="${isReady ? 'button' : 'listitem'}"
         tabindex="${isReady ? '0' : '-1'}">
      <div class="dl-poster-wrap">
        <img 
          src="${posterPath || ''}" 
          alt="${title}"
          onerror="this.style.opacity='0'"
          loading="lazy"
        />
        ${posterOverlay}
      </div>

      <div class="dl-card-body">
        <div class="dl-card-title">${title}</div>
        <div class="dl-card-meta">
          <span>${typeLabel}</span>
          ${sizeLabel ? `<span>·</span><span>${sizeLabel}</span>` : ''}
          ${isReady ? `<span class="dl-quality-badge">HD</span>` : ''}
        </div>
        ${statusHTML}
      </div>

      <div class="dl-card-actions">
        <button 
          class="dl-action-btn delete btn-del-dl" 
          data-id="${id}" 
          data-title="${title}"
          aria-label="Remove download"
          title="Remove">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

export function renderDownloadsPage(ctx) {
  const container = document.getElementById('page-content') || document.getElementById('app') || document.body;
  container.innerHTML = '';
  window.scrollTo(0, 0);
  updateSidebarActive?.();

  // ---- Not available on web ----
  if (!Capacitor.isNativePlatform()) {
    container.innerHTML = `
      <div class="downloads-native-only">
        <div class="native-icon">📲</div>
        <h2>Android App Required</h2>
        <p>Offline downloads are only available in the native Android app for secure sandboxed playback.</p>
      </div>
    `;
    return;
  }

  // ---- Build the page shell ----
  const page = document.createElement('div');
  page.className = 'downloads-page';
  page.innerHTML = `
    <div class="downloads-header">
      <div class="downloads-header-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
      <div>
        <h1>My Downloads</h1>
        <div class="header-subtitle">Available offline</div>
      </div>
    </div>

    <div id="dl-offline-pill" style="display:none" class="downloads-offline-pill">
      <span class="pill-dot"></span>
      Watching in offline mode
    </div>

    <div id="dl-storage-bar" class="downloads-storage-bar" style="display:none"></div>
    <div id="dl-list-area"></div>
  `;

  container.appendChild(page);

  const offlinePill  = page.querySelector('#dl-offline-pill');
  const storageBar   = page.querySelector('#dl-storage-bar');
  const listArea     = page.querySelector('#dl-list-area');

  // ---- Show offline indicator ----
  function updateOfflinePill() {
    offlinePill.style.display = isOnline() ? 'none' : 'flex';
  }
  updateOfflinePill();
  window.addEventListener('piq-online',  updateOfflinePill);
  window.addEventListener('piq-offline', updateOfflinePill);

  // ---- Storage bar ----
  async function renderStorageBar() {
    try {
      const est     = await DownloadManager.getStorageEstimate();
      const usedPct = Math.min(100, Math.round((est.usage / est.totalDisk) * 100));
      storageBar.style.display = 'block';
      storageBar.innerHTML = `
        <div class="storage-bar-row">
          <span><strong>${_formatSize(est.usage)}</strong> PlayerIQ</span>
          <span><strong>${_formatSize(est.freeSpace)}</strong> free</span>
        </div>
        <div class="storage-bar-track">
          <div class="storage-bar-fill" style="width:${usedPct}%"></div>
        </div>
      `;
    } catch (e) { /* ignore */ }
  }
  renderStorageBar();

  // ---- Full list render ----
  async function renderList() {
    const items = await DownloadManager.list();
    const offline = !isOnline();

    if (items.length === 0) {
      if (offline) {
        // Offline + no downloads → special offline hero
        listArea.innerHTML = `
          <div class="downloads-empty">
            <div class="downloads-empty-icon" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.15);">
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5" stroke-linecap="round">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
                <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <circle cx="12" cy="20" r="1" fill="#f87171"/>
              </svg>
            </div>
            <h2 style="color:#f87171;">You're Offline</h2>
            <p>No downloaded videos yet. Connect to internet to browse &amp; download content.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
              <a href="#/" class="downloads-empty-cta" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;box-shadow:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                Home
              </a>
            </div>
          </div>
        `;
      } else {
        listArea.innerHTML = `
          <div class="downloads-empty">
            <div class="downloads-empty-icon">📥</div>
            <h2>No Downloads Yet</h2>
            <p>Save movies &amp; shows to watch offline anytime, even without internet.</p>
            <a href="#/" class="downloads-empty-cta">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
              Browse Content
            </a>
          </div>
        `;
      }
      return;
    }

    // Separate completed vs in-progress
    const completed    = items.filter(i => i.status === 'COMPLETED');
    const inProgress   = items.filter(i => i.status !== 'COMPLETED');

    let html = '';

    if (inProgress.length > 0) {
      html += `<div class="downloads-section-header">Downloading</div>`;
      html += `<div class="downloads-grid">${inProgress.map(_cardHTML).join('')}</div>`;
    }
    if (completed.length > 0) {
      html += `<div class="downloads-section-header">Ready to Watch</div>`;
      html += `<div class="downloads-grid">${completed.map(_cardHTML).join('')}</div>`;
    }

    listArea.innerHTML = html;
    _wireCards(items);
  }

  function _wireCards(items) {
    // Play completed cards
    listArea.querySelectorAll('.dl-card-v2.completed').forEach(card => {
      card.addEventListener('click', async () => {
        const id   = card.dataset.id;
        const item = items.find(x => x.id === id);
        if (item) await _launchInPlayer(item);
      });
      card.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const id   = card.dataset.id;
          const item = items.find(x => x.id === id);
          if (item) await _launchInPlayer(item);
        }
      });
    });

    // Delete buttons
    listArea.querySelectorAll('.btn-del-dl').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { id, title } = btn.dataset;
        if (confirm(`Remove "${title}" from downloads?`)) {
          await DownloadManager.remove(id);
          renderList();
          renderStorageBar();
        }
      });
    });
  }

  // Initial render
  renderList();

  // ---- Live progress update (no re-render, only update DOM nodes) ----
  const handleProgress = (e) => {
    const { id, progress, status } = e.detail || {};
    if (!id) return;

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Update flat progress bar
    const bar = document.getElementById(`bar-${safeId}`);
    const pctTxt = document.getElementById(`pct-txt-${safeId}`);
    if (bar) bar.style.width = `${progress}%`;
    if (pctTxt) pctTxt.textContent = `${progress}%`;

    // Update circular ring
    const ringFill = document.getElementById(`ring-fill-${safeId}`);
    const ringTxt  = document.getElementById(`ring-txt-${safeId}`);
    if (ringFill) ringFill.style.strokeDashoffset = _pct2offset(progress);
    if (ringTxt)  ringTxt.textContent = `${progress}%`;
  };

  // ---- Full re-render only on status changes ----
  const handleStatusChange = () => {
    renderList();
    renderStorageBar();
  };

  window.addEventListener('download-progress',      handleProgress);
  window.addEventListener('download-status-change', handleStatusChange);
  window.addEventListener('downloadsUpdated',        handleStatusChange);

  // ---- Cleanup listeners on navigation away ----
  const cleanupObserver = new MutationObserver(() => {
    if (!document.contains(page)) {
      window.removeEventListener('download-progress',      handleProgress);
      window.removeEventListener('download-status-change', handleStatusChange);
      window.removeEventListener('downloadsUpdated',        handleStatusChange);
      window.removeEventListener('piq-online',             updateOfflinePill);
      window.removeEventListener('piq-offline',            updateOfflinePill);
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });
}

// ---- Launch downloaded content in the PlayerPage ----
async function _launchInPlayer(item) {
  const { id, type } = item;

  // Signal to PlayerPage to immediately use offline mode
  sessionStorage.setItem('piq_force_offline', '1');

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
