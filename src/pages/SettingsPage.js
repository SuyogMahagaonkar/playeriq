// ========================================
// PlayerIQ — Settings Page
// ========================================

import { getUser, login, logout } from '../services/auth.js';
import { navigate } from '../services/router.js';
import { getSettings, saveSettings, clearAllWatchHistory } from '../services/firebase.js';
import { createFooter } from '../components/Footer.js';

export async function renderSettingsPage({ container }) {
  const user = getUser();

  if (!user) {
    container.innerHTML = `
      <div class="user-page">
        <div class="user-guest-prompt">
          <div class="user-guest-prompt-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <h2>Sign in to access Settings</h2>
          <p>Your preferences and account settings are saved to your profile.</p>
          <button class="user-guest-signin-btn" id="settings-signin-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
            Sign in with Google
          </button>
        </div>
      </div>`;
    container.querySelector('#settings-signin-btn')?.addEventListener('click', login);
    return;
  }

  container.innerHTML = `<div class="user-page" style="display:flex;align-items:center;justify-content:center;min-height:60vh"><div class="load-more-spinner" style="width:40px;height:40px"></div></div>`;

  const prefs = await getSettings(user.uid).catch(() => ({ language: 'all', autoplay: true, quality: 'auto', safeSearch: true }));

  container.innerHTML = `
    <div class="user-page">
      <div class="user-page-header">
        <div class="user-page-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </div>
        <div class="user-page-meta">
          <h1 class="user-page-title">Settings</h1>
          <p class="user-page-subtitle">Manage your account and preferences</p>
        </div>
      </div>

      <div class="user-page-body">
        <div class="settings-layout">

          <!-- Profile -->
          <div class="settings-section">
            <div class="settings-section-title">Profile</div>
            <div class="settings-profile-row">
              <div class="settings-profile-avatar">
                ${user.photoURL
                  ? `<img src="${user.photoURL}" alt="${user.displayName ?? ''}" />`
                  : (user.displayName?.[0]?.toUpperCase() ?? 'U')}
              </div>
              <div class="settings-profile-info">
                <div class="settings-profile-name">${user.displayName ?? 'User'}</div>
                <div class="settings-profile-email">${user.email ?? ''}</div>
              </div>
              <span class="settings-profile-badge">Google</span>
            </div>
          </div>

          <!-- Playback Preferences -->
          <div class="settings-section">
            <div class="settings-section-title">Playback</div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Autoplay Next Episode</div>
                <div class="settings-row-desc">Automatically play the next episode when the current one ends</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="pref-autoplay" ${prefs.autoplay ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Default Quality</div>
                <div class="settings-row-desc">Preferred video stream quality</div>
              </div>
              <select class="settings-select" id="pref-quality">
                <option value="auto" ${prefs.quality === 'auto' ? 'selected' : ''}>Auto</option>
                <option value="1080p" ${prefs.quality === '1080p' ? 'selected' : ''}>1080p HD</option>
                <option value="720p"  ${prefs.quality === '720p'  ? 'selected' : ''}>720p</option>
                <option value="480p"  ${prefs.quality === '480p'  ? 'selected' : ''}>480p</option>
              </select>
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Safe Search</div>
                <div class="settings-row-desc">Hide explicitly adult and erotic content from search and browse</div>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" id="pref-safesearch" ${prefs.safeSearch ? 'checked' : ''} />
                <span class="settings-toggle-track"></span>
              </label>
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Content Language</div>
                <div class="settings-row-desc">Filter content by language preference</div>
              </div>
              <select class="settings-select" id="pref-language">
                <option value="all" ${prefs.language === 'all' ? 'selected' : ''}>All Languages</option>
                <option value="en"  ${prefs.language === 'en'  ? 'selected' : ''}>English</option>
                <option value="hi"  ${prefs.language === 'hi'  ? 'selected' : ''}>Hindi</option>
                <option value="ko"  ${prefs.language === 'ko'  ? 'selected' : ''}>Korean</option>
                <option value="ja"  ${prefs.language === 'ja'  ? 'selected' : ''}>Japanese</option>
              </select>
            </div>
          </div>

          <!-- Account -->
          <div class="settings-section">
            <div class="settings-section-title">Account</div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Watch History</div>
                <div class="settings-row-desc">Permanently delete your entire watch history</div>
              </div>
              <button class="settings-danger-btn" id="settings-clear-history">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                Clear History
              </button>
            </div>

            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Sign Out</div>
                <div class="settings-row-desc">Sign out of your Google account on this device</div>
              </div>
              <button class="settings-signout-btn" id="settings-signout">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
    ${createFooter()}`;

  // ---- Live preference saving ----
  const save = async () => {
    const newPrefs = {
      autoplay: document.getElementById('pref-autoplay')?.checked ?? true,
      quality:  document.getElementById('pref-quality')?.value  ?? 'auto',
      language: document.getElementById('pref-language')?.value ?? 'all',
      safeSearch: document.getElementById('pref-safesearch')?.checked ?? true
    };
    await saveSettings(user.uid, newPrefs);
    // Also save safeSearch to localStorage for synchronous access in api.js
    localStorage.setItem('piq_safesearch', newPrefs.safeSearch ? 'true' : 'false');
    showToast('✓ Settings saved');
  };

  container.querySelector('#pref-autoplay')?.addEventListener('change', save);
  container.querySelector('#pref-quality')?.addEventListener('change', save);
  container.querySelector('#pref-language')?.addEventListener('change', save);
  container.querySelector('#pref-safesearch')?.addEventListener('change', save);

  // Clear history
  container.querySelector('#settings-clear-history')?.addEventListener('click', async () => {
    if (!confirm('Delete your entire watch history? This cannot be undone.')) return;
    await clearAllWatchHistory(user.uid);
    showToast('✓ Watch history cleared');
  });

  // Sign out
  container.querySelector('#settings-signout')?.addEventListener('click', async () => {
    await logout();
    navigate('/');
  });

  if (window.lucide) window.lucide.createIcons();
}

function showToast(msg) {
  document.querySelectorAll('.settings-saved-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'settings-saved-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}
