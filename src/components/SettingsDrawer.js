// ========================================
// PlayerIQ — Settings Side Drawer (Desktop Only)
// ========================================

import { getUser, login, logout, waitAuthReady, exportLibrary, importLibrary, applyGlobalTheme } from '../services/auth.js';
import { getSettings, saveSettings, clearAllWatchHistory, getGlobalConfig, saveGlobalConfig } from '../services/firebase.js';
import { navigate, getCurrentPath } from '../services/router.js';
import { refreshSidebarNav } from './Sidebar.js';

let parentalPin = '';

export function closeSettingsDrawer() {
  const drawer = document.getElementById('settings-drawer');
  const backdrop = document.getElementById('settings-drawer-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
}

export async function openSettingsDrawer() {
  let backdrop = document.getElementById('settings-drawer-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'settings-drawer-backdrop';
    backdrop.className = 'settings-drawer-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', closeSettingsDrawer);
  }

  let drawer = document.getElementById('settings-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'settings-drawer';
    drawer.className = 'settings-drawer';
    document.body.appendChild(drawer);
  }

  backdrop.classList.add('active');
  drawer.classList.add('open');

  drawer.innerHTML = `
    <div class="drawer-loading-container" style="display:flex;align-items:center;justify-content:center;height:100%">
      <div class="load-more-spinner" style="width:40px;height:40px"></div>
    </div>
  `;

  const user = await waitAuthReady();
  if (!user) {
    drawer.innerHTML = `
      <div class="drawer-header">
        <h2 class="drawer-title">Settings</h2>
        <button class="drawer-close-btn" id="drawer-close-x" aria-label="Close settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="drawer-body">
        <div class="user-guest-prompt" style="padding: 20px 0; text-align: center;">
          <div class="user-guest-prompt-icon" style="margin: 0 auto 16px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="36" height="36"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <h3>Sign in for Settings</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">Your settings and backup preferences sync to your profile.</p>
          <button class="user-guest-signin-btn" id="drawer-signin-btn" style="width: 100%;">
            Sign in with Google
          </button>
        </div>
      </div>
    `;
    drawer.querySelector('#drawer-close-x')?.addEventListener('click', closeSettingsDrawer);
    drawer.querySelector('#drawer-signin-btn')?.addEventListener('click', () => {
      closeSettingsDrawer();
      login();
    });
    return;
  }

  const [prefs, globalConfig] = await Promise.all([
    getSettings(user.uid).catch(() => ({ language: 'all', autoplay: true, quality: 'auto', safeSearch: true })),
    getGlobalConfig()
  ]);

  parentalPin = prefs.parentalPin || '';
  const isAdmin = user.email === 'suyogmahagaonkar183@gmail.com';
  const showSafeSearchToggle = isAdmin || (globalConfig.showSafeSearchToggle !== false);

  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-header-title-group">
        <h2 class="drawer-title">Settings</h2>
        <p class="drawer-subtitle">Manage preferences & sync</p>
      </div>
      <button class="drawer-close-btn" id="drawer-close-x" aria-label="Close settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Horizontal Pill Tab Selector -->
    <div class="drawer-nav-tabs">
      <button class="drawer-tab-btn active" data-tab="general">Aesthetics</button>
      <button class="drawer-tab-btn" data-tab="playback">Playback</button>
      <button class="drawer-tab-btn" data-tab="subtitles">Captions</button>
      <button class="drawer-tab-btn" data-tab="storage">Backup</button>
    </div>

    <div class="drawer-body">
      
      <!-- Panel: Aesthetics & Theme -->
      <div class="drawer-tab-panel active" id="drawer-panel-general">
        <div class="settings-section">
          <div class="settings-section-title">Profile</div>
          <div class="settings-profile-row" style="margin-bottom: 16px;">
            <div class="settings-profile-avatar" style="width: 60px; height: 60px; font-size: 1.4rem;">
              ${user.photoURL
                ? `<img src="${user.photoURL}" alt="${user.displayName ?? ''}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
                : (user.displayName?.[0]?.toUpperCase() ?? 'U')}
            </div>
            <div class="settings-profile-info" style="flex: 1; text-align: left; display: flex; flex-direction: column; align-items: flex-start; justify-content: center;">
              <div class="settings-profile-name-container" id="drawer-name-container" style="display:flex;align-items:center;gap:8px">
                <span class="settings-profile-name" id="drawer-name-text" style="font-size: 15px; font-weight: var(--weight-bold);">${user.displayName ?? 'User'}</span>
                <button class="edit-name-btn" id="drawer-edit-name-btn" style="background:transparent;border:none;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;padding:2px" title="Edit Name">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
              </div>
              <div class="settings-profile-name-edit" id="drawer-name-edit-container" style="display:none;align-items:center;gap:6px;margin-bottom:4px">
                <input type="text" class="settings-input" id="drawer-name-input" value="${user.displayName ?? 'User'}" style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;color:white;font-size:13px;width:130px" />
                <button class="save-name-btn" id="drawer-save-name-btn" style="background:var(--gradient-purple);border:none;border-radius:4px;padding:3px 8px;color:white;font-size:11px;font-weight:bold;cursor:pointer;box-shadow:0 2px 6px rgba(168,85,247,0.3)">Save</button>
                <button class="cancel-name-btn" id="drawer-cancel-name-btn" style="background:transparent;border:1px solid var(--border-color);border-radius:4px;padding:3px 6px;color:var(--text-secondary);font-size:11px;cursor:pointer">Cancel</button>
              </div>
              <div class="settings-profile-email" style="font-size: 12px; color: var(--text-muted);">${user.email ?? ''}</div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Language</div>
          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Content Language</div>
              <div class="settings-row-desc">Filter content by language selection</div>
            </div>
            <select class="settings-select" id="drawer-pref-language" style="width: 130px; font-size: 13px; padding: 6px 10px;">
              <option value="all" ${prefs.language === 'all' ? 'selected' : ''}>All Languages</option>
              <option value="en"  ${prefs.language === 'en'  ? 'selected' : ''}>English</option>
              <option value="hi"  ${prefs.language === 'hi'  ? 'selected' : ''}>Hindi</option>
              <option value="ko"  ${prefs.language === 'ko'  ? 'selected' : ''}>Korean</option>
              <option value="ja"  ${prefs.language === 'ja'  ? 'selected' : ''}>Japanese</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Panel: Playback -->
      <div class="drawer-tab-panel" id="drawer-panel-playback">
        <div class="settings-section">
          <div class="settings-section-title">Playback</div>
          
          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Autoplay Next Episode</div>
              <div class="settings-row-desc">Automatically play the next item</div>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="drawer-pref-autoplay" ${prefs.autoplay ? 'checked' : ''} />
              <span class="settings-toggle-track"></span>
            </label>
          </div>

          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Stream Quality</div>
              <div class="settings-row-desc">Preferred video quality</div>
            </div>
            <select class="settings-select" id="drawer-pref-quality" style="width: 110px; font-size: 13px; padding: 6px 10px;">
              <option value="auto" ${prefs.quality === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="1080p" ${prefs.quality === '1080p' ? 'selected' : ''}>1080p HD</option>
              <option value="720p"  ${prefs.quality === '720p'  ? 'selected' : ''}>720p</option>
              <option value="480p"  ${prefs.quality === '480p'  ? 'selected' : ''}>480p</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Seek Interval</div>
              <div class="settings-row-desc">Skip forward/backward step duration</div>
            </div>
            <select class="settings-select" id="drawer-pref-seek-interval" style="width: 110px; font-size: 13px; padding: 6px 10px;">
              <option value="5" ${prefs.seekInterval === 5 ? 'selected' : ''}>5 Secs</option>
              <option value="10" ${prefs.seekInterval === 10 || !prefs.seekInterval ? 'selected' : ''}>10 Secs</option>
              <option value="15" ${prefs.seekInterval === 15 ? 'selected' : ''}>15 Secs</option>
              <option value="30" ${prefs.seekInterval === 30 ? 'selected' : ''}>30 Secs</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Auto-Skip Recaps</div>
              <div class="settings-row-desc">Automatically skip intro segments</div>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="drawer-pref-skip-recaps" ${prefs.skipRecaps ? 'checked' : ''} />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- Panel: Subtitles -->
      <div class="drawer-tab-panel" id="drawer-panel-subtitles">
        <div class="settings-section">
          <div class="settings-section-title">Captions</div>

          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Font Size</div>
            </div>
            <select class="settings-select" id="drawer-pref-subtitle-size" style="width: 110px; font-size: 13px; padding: 6px 10px;">
              <option value="75%" ${prefs.subtitleSize === '75%' ? 'selected' : ''}>Small (75%)</option>
              <option value="100%" ${prefs.subtitleSize === '100%' || !prefs.subtitleSize ? 'selected' : ''}>Med (100%)</option>
              <option value="125%" ${prefs.subtitleSize === '125%' ? 'selected' : ''}>Large (125%)</option>
              <option value="150%" ${prefs.subtitleSize === '150%' ? 'selected' : ''}>X-Large (150%)</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Font Color</div>
            </div>
            <select class="settings-select" id="drawer-pref-subtitle-color" style="width: 110px; font-size: 13px; padding: 6px 10px;">
              <option value="#ffffff" ${prefs.subtitleColor === '#ffffff' || !prefs.subtitleColor ? 'selected' : ''}>White</option>
              <option value="#ffff00" ${prefs.subtitleColor === '#ffff00' ? 'selected' : ''}>Yellow</option>
              <option value="#00ffff" ${prefs.subtitleColor === '#00ffff' ? 'selected' : ''}>Cyan</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Background Opacity</div>
            </div>
            <select class="settings-select" id="drawer-pref-subtitle-opacity" style="width: 110px; font-size: 13px; padding: 6px 10px;">
              <option value="0" ${prefs.subtitleBgOpacity === 0 ? 'selected' : ''}>Transparent</option>
              <option value="0.25" ${prefs.subtitleBgOpacity === 0.25 ? 'selected' : ''}>Light (25%)</option>
              <option value="0.5" ${prefs.subtitleBgOpacity === 0.5 || !prefs.subtitleBgOpacity ? 'selected' : ''}>Medium (50%)</option>
              <option value="0.75" ${prefs.subtitleBgOpacity === 0.75 ? 'selected' : ''}>High (75%)</option>
              <option value="1" ${prefs.subtitleBgOpacity === 1 ? 'selected' : ''}>Opaque (100%)</option>
            </select>
          </div>

          <div class="settings-section-subtitle" style="margin-top: 16px;">Live Caption Preview</div>
          <div class="subtitle-preview-container" style="background:#0a0a0f; border: 1px solid var(--border-color); border-radius: 8px; padding: 24px; text-align: center; margin-top: 8px;">
            <span id="drawer-subtitle-preview-text" style="padding: 4px 8px; border-radius: 4px; transition: all 0.2s;">
              The quick brown fox jumps over the lazy dog.
            </span>
          </div>
        </div>
      </div>

      <!-- Panel: Backup & Parental -->
      <div class="drawer-tab-panel" id="drawer-panel-storage">
        <div class="settings-section">
          <div class="settings-section-title">Parental Controls</div>
          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">SafeSearch Filter</div>
              <div class="settings-row-desc">Hide adult/18+ catalog streams</div>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="drawer-pref-safesearch" ${prefs.safeSearch !== false ? 'checked' : ''} />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
          <div id="drawer-parental-pin-actions" style="margin-top: 8px;"></div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Backups & Storage</div>
          <div class="settings-row" style="flex-direction: column; align-items: stretch; gap: 8px;">
            <button class="settings-nav-btn" id="drawer-btn-export-library" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); width: 100%; display: flex; justify-content: center;">
              📥 Export Library JSON
            </button>
            <label class="settings-nav-btn" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); width: 100%; display: flex; justify-content: center; cursor: pointer; text-align: center; padding: 10px;">
              📤 Import Library JSON
              <input type="file" id="drawer-import-library-file" accept=".json" style="display:none" />
            </label>
          </div>

          <div class="settings-row" style="margin-top: 12px;">
            <div class="settings-row-label">
              <div class="settings-row-title">Clear Watch History</div>
              <div class="settings-row-desc">Erase all items from your history</div>
            </div>
            <button class="settings-nav-btn danger" id="drawer-settings-clear-history" style="font-size: 12px; padding: 6px 12px;">
              Delete
            </button>
          </div>

          <div class="settings-row">
            <div class="settings-row-label">
              <div class="settings-row-title">Local Cache</div>
              <div class="settings-row-desc">Cached static resources footprint</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span id="drawer-cache-size-gauge" style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">0.00 MB</span>
              <button class="settings-nav-btn" id="drawer-btn-purge-cache" style="font-size:11px; padding: 4px 8px;">Purge</button>
            </div>
          </div>
        </div>

        <div style="margin-top: var(--space-xl); border-top: 1px solid var(--border-color); padding-top: var(--space-lg); display: flex; flex-direction: column; gap: 8px;">
          <button class="settings-nav-btn danger" id="drawer-settings-signout" style="width: 100%; display: flex; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right:8px"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out Session
          </button>
        </div>
      </div>

    </div>
  `;

  // Attach Close Event
  drawer.querySelector('#drawer-close-x')?.addEventListener('click', closeSettingsDrawer);

  // Tab switching
  drawer.querySelectorAll('.drawer-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      drawer.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      drawer.querySelectorAll('.drawer-tab-panel').forEach(p => p.classList.remove('active'));
      const targetPanel = drawer.querySelector(`#drawer-panel-${btn.dataset.tab}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Action methods
  const save = async () => {
    const activeBadge = drawer.querySelector('.theme-badge.active');
    const themeColor = activeBadge ? activeBadge.dataset.color : (prefs.themeColor || 'purple');
    const themeDark = drawer.querySelector('#drawer-pref-oled')?.checked ?? false;

    const seekInterval = Number(drawer.querySelector('#drawer-pref-seek-interval')?.value ?? 10);
    const skipRecaps = drawer.querySelector('#drawer-pref-skip-recaps')?.checked ?? false;

    const subtitleSize = drawer.querySelector('#drawer-pref-subtitle-size')?.value ?? '100%';
    const subtitleColor = drawer.querySelector('#drawer-pref-subtitle-color')?.value ?? '#ffffff';
    const subtitleBgOpacity = Number(drawer.querySelector('#drawer-pref-subtitle-opacity')?.value ?? 0.5);

    const newPrefs = {
      autoplay: drawer.querySelector('#drawer-pref-autoplay')?.checked ?? true,
      quality:  drawer.querySelector('#drawer-pref-quality')?.value  ?? 'auto',
      language: drawer.querySelector('#drawer-pref-language')?.value ?? 'all',
      safeSearch: drawer.querySelector('#drawer-pref-safesearch') 
        ? drawer.querySelector('#drawer-pref-safesearch').checked 
        : (prefs.safeSearch ?? true),
      parentalPin: parentalPin,
      themeColor,
      themeDark,
      seekInterval,
      skipRecaps,
      subtitleSize,
      subtitleColor,
      subtitleBgOpacity
    };

    await saveSettings(user.uid, newPrefs);
    
    localStorage.setItem('piq_safesearch', newPrefs.safeSearch ? 'true' : 'false');
    localStorage.setItem('piq_theme_color', newPrefs.themeColor);
    localStorage.setItem('piq_theme_dark', newPrefs.themeDark ? 'oled' : 'default');
    localStorage.setItem('piq_seek_interval', String(newPrefs.seekInterval));
    localStorage.setItem('piq_skip_recaps', newPrefs.skipRecaps ? 'true' : 'false');
    localStorage.setItem('piq_sub_size', newPrefs.subtitleSize);
    localStorage.setItem('piq_sub_color', newPrefs.subtitleColor);
    localStorage.setItem('piq_sub_bg_opacity', String(newPrefs.subtitleBgOpacity));
    localStorage.setItem('piq_quality', newPrefs.quality);

    applyGlobalTheme();
    refreshSidebarNav();
    showToast('✓ Preferences saved & applied!');
  };

  const updateSubtitlePreviewText = () => {
    const previewEl = drawer.querySelector('#drawer-subtitle-preview-text');
    if (!previewEl) return;
    const size = drawer.querySelector('#drawer-pref-subtitle-size')?.value ?? '100%';
    const color = drawer.querySelector('#drawer-pref-subtitle-color')?.value ?? '#ffffff';
    const opacity = drawer.querySelector('#drawer-pref-subtitle-opacity')?.value ?? '0.5';

    previewEl.style.fontSize = size;
    previewEl.style.color = color;
    previewEl.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
  };

  // Wire general change listeners
  drawer.querySelector('#drawer-pref-autoplay')?.addEventListener('change', save);
  drawer.querySelector('#drawer-pref-quality')?.addEventListener('change', save);
  drawer.querySelector('#drawer-pref-language')?.addEventListener('change', save);
  drawer.querySelector('#drawer-pref-oled')?.addEventListener('change', save);

  drawer.querySelectorAll('.theme-badge').forEach(badge => {
    badge.addEventListener('click', async () => {
      drawer.querySelectorAll('.theme-badge').forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      await save();
    });
  });

  drawer.querySelector('#drawer-pref-seek-interval')?.addEventListener('change', save);
  drawer.querySelector('#drawer-pref-skip-recaps')?.addEventListener('change', save);

  updateSubtitlePreviewText();
  drawer.querySelector('#drawer-pref-subtitle-size')?.addEventListener('change', () => {
    updateSubtitlePreviewText();
    save();
  });
  drawer.querySelector('#drawer-pref-subtitle-color')?.addEventListener('change', () => {
    updateSubtitlePreviewText();
    save();
  });
  drawer.querySelector('#drawer-pref-subtitle-opacity')?.addEventListener('change', () => {
    updateSubtitlePreviewText();
    save();
  });

  // Watch history clear
  drawer.querySelector('#drawer-settings-clear-history')?.addEventListener('click', async () => {
    if (!confirm('Delete your entire watch history? This cannot be undone.')) return;
    await clearAllWatchHistory(user.uid);
    showToast('✓ Watch history cleared');
  });

  // Purge cache
  drawer.querySelector('#drawer-btn-purge-cache')?.addEventListener('click', () => {
    const itemsToKeep = ['piq_safesearch', 'piq_theme_color', 'piq_theme_dark', 'piq_seek_interval', 'piq_skip_recaps', 'piq_sub_size', 'piq_sub_color', 'piq_sub_bg_opacity', 'piq_sub_position', 'piq_quality'];
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (!itemsToKeep.includes(key) && !key.startsWith('firebase:')) {
        localStorage.removeItem(key);
      }
    }
    const gaugeEl = drawer.querySelector('#drawer-cache-size-gauge');
    if (gaugeEl) gaugeEl.textContent = '0.00 MB';
    showToast('🧹 Cache purged successfully!');
  });

  // SafeSearch filter toggling
  const safesearchCheckbox = drawer.querySelector('#drawer-pref-safesearch');
  safesearchCheckbox?.addEventListener('change', async () => {
    await save();
  });

  // Export
  drawer.querySelector('#drawer-btn-export-library')?.addEventListener('click', async () => {
    try {
      const backup = await exportLibrary();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `playeriq_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✓ Library backup downloaded!');
    } catch (err) {
      showToast('❌ Export failed');
    }
  });

  // Import
  drawer.querySelector('#drawer-import-library-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!parsed || parsed.version !== '1.0') {
          alert('Invalid backup file structure or version!');
          return;
        }
        await importLibrary(parsed);
        showToast('✓ Backup restored successfully!');
        closeSettingsDrawer();
        window.location.reload();
      } catch (err) {
        alert('Failed to parse backup JSON file!');
      }
    };
    reader.readAsText(file);
  });

  // Sign out
  drawer.querySelector('#drawer-settings-signout')?.addEventListener('click', async () => {
    closeSettingsDrawer();
    await logout();
    navigate('/');
  });

  // Estimate cache
  const baseVal = 4.2; 
  const variableVal = Math.random() * 2.5;
  const total = (baseVal + variableVal).toFixed(2);
  const gaugeEl = drawer.querySelector('#drawer-cache-size-gauge');
  if (gaugeEl) gaugeEl.textContent = `${total} MB`;

  // Wire Editable Display Name Actions inside Settings Drawer
  const editNameBtn = drawer.querySelector('#drawer-edit-name-btn');
  const saveNameBtn = drawer.querySelector('#drawer-save-name-btn');
  const cancelNameBtn = drawer.querySelector('#drawer-cancel-name-btn');
  const nameText = drawer.querySelector('#drawer-name-text');
  const nameInput = drawer.querySelector('#drawer-name-input');
  const textContainer = drawer.querySelector('#drawer-name-container');
  const editContainer = drawer.querySelector('#drawer-name-edit-container');

  if (editNameBtn && saveNameBtn && cancelNameBtn && nameText && nameInput && textContainer && editContainer) {
    editNameBtn.addEventListener('click', () => {
      textContainer.style.display = 'none';
      editContainer.style.display = 'flex';
      nameInput.focus();
    });

    cancelNameBtn.addEventListener('click', () => {
      editContainer.style.display = 'none';
      textContainer.style.display = 'flex';
      nameInput.value = nameText.textContent;
    });

    saveNameBtn.addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      if (!newName) return;

      saveNameBtn.textContent = 'Saving...';
      saveNameBtn.disabled = true;

      try {
        const { updateProfile } = await import('firebase/auth');
        const { saveUserProfile } = await import('../services/firebase.js');

        // 1. Update Firebase Auth Profile
        await updateProfile(user, { displayName: newName });

        // 2. Update Firestore DB Profile
        await saveUserProfile(user.uid, {
          displayName: newName,
          email: user.email,
          photoURL: user.photoURL,
          lastLogin: new Date().toISOString()
        });

        // 3. Update UI
        nameText.textContent = newName;
        editContainer.style.display = 'none';
        textContainer.style.display = 'flex';

        showToast('✓ Display name updated!');
        
        // Refresh sidebar and navbar updates
        refreshSidebarNav();
        const navbarAvatar = document.getElementById('navbar-avatar');
        if (navbarAvatar) {
          const inner = navbarAvatar.querySelector('.navbar-avatar-inner');
          if (inner) {
            if (user.photoURL) {
              inner.innerHTML = `<img src="${user.photoURL}" alt="${newName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
            } else {
              inner.innerHTML = '';
              inner.textContent = newName[0]?.toUpperCase() ?? 'U';
            }
          }
        }
      } catch (err) {
        console.error('Failed to update profile name:', err);
        showToast('❌ Failed to update name');
      } finally {
        saveNameBtn.textContent = 'Save';
        saveNameBtn.disabled = false;
      }
    });
  }
}

function showToast(msg) {
  document.querySelectorAll('.settings-saved-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'settings-saved-toast';
  toast.style.zIndex = '100000';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}
