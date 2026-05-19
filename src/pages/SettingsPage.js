// ========================================
// PlayerIQ — Settings Page
// ========================================

import { getUser, login, logout, waitAuthReady } from '../services/auth.js';
import { navigate } from '../services/router.js';
import { getSettings, saveSettings, clearAllWatchHistory, getGlobalConfig, saveGlobalConfig } from '../services/firebase.js';
import { createFooter } from '../components/Footer.js';
import { refreshSidebarNav } from '../components/Sidebar.js';

export async function renderSettingsPage({ container }) {
  const user = await waitAuthReady();

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

  const [prefs, globalConfig] = await Promise.all([
    getSettings(user.uid).catch(() => ({ language: 'all', autoplay: true, quality: 'auto', safeSearch: true })),
    getGlobalConfig()
  ]);

  const isAdmin = user.email === 'suyogmahagaonkar183@gmail.com';
  const showSafeSearchToggle = isAdmin || (globalConfig.showSafeSearchToggle !== false);

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
        <div class="settings-grid-layout">
          
          <!-- Left: Tab navigation sidebar -->
          <div class="settings-nav-sidebar">
            <button class="settings-nav-btn active" data-tab="general">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Profile & General</span>
            </button>
            <button class="settings-nav-btn" data-tab="playback">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              <span>Playback Preferences</span>
            </button>
            ${showSafeSearchToggle ? `
            <button class="settings-nav-btn" data-tab="parental">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Parental Controls</span>
            </button>
            ` : ''}
            <button class="settings-nav-btn" data-tab="account">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="8" r="5"/></svg>
              <span>Account Management</span>
            </button>
            ${isAdmin ? `
            <button class="settings-nav-btn admin-nav-btn" data-tab="admin">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>🛡️ Admin Controls</span>
            </button>
            ` : ''}
          </div>

          <!-- Right: Content panes -->
          <div class="settings-content-panes" style="width: 100%;">
            
            <!-- Tab: General -->
            <div class="settings-tab-panel active" id="panel-general">
              <!-- Profile Card -->
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

              <!-- General System -->
              <div class="settings-section">
                <div class="settings-section-title">System & Region</div>
                <div class="settings-row">
                  <div class="settings-row-label">
                    <div class="settings-row-title">Content Language</div>
                    <div class="settings-row-desc">Filter content and metadata lists by language preference</div>
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
            </div>

            <!-- Tab: Playback -->
            <div class="settings-tab-panel" id="panel-playback">
              <div class="settings-section">
                <div class="settings-section-title">Playback Preferences</div>
                
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
                    <div class="settings-row-desc">Preferred video stream resolution quality</div>
                  </div>
                  <select class="settings-select" id="pref-quality">
                    <option value="auto" ${prefs.quality === 'auto' ? 'selected' : ''}>Auto</option>
                    <option value="1080p" ${prefs.quality === '1080p' ? 'selected' : ''}>1080p HD</option>
                    <option value="720p"  ${prefs.quality === '720p'  ? 'selected' : ''}>720p</option>
                    <option value="480p"  ${prefs.quality === '480p'  ? 'selected' : ''}>480p</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Tab: Parental -->
            ${showSafeSearchToggle ? `
            <div class="settings-tab-panel" id="panel-parental">
              <div class="settings-section">
                <div class="settings-section-title">Parental Controls</div>
                
                <div class="settings-row">
                  <div class="settings-row-label">
                    <div class="settings-row-title">Safe Search</div>
                    <div class="settings-row-desc">
                      Hide explicitly adult and erotic content from search and browse lists
                      <div id="parental-pin-actions" style="margin-top: 5px;"></div>
                    </div>
                  </div>
                  <label class="settings-toggle">
                    <input type="checkbox" id="pref-safesearch" ${prefs.safeSearch ? 'checked' : ''} />
                    <span class="settings-toggle-track"></span>
                  </label>
                </div>
              </div>
            </div>
            ` : ''}

            <!-- Tab: Account -->
            <div class="settings-tab-panel" id="panel-account">
              <div class="settings-section">
                <div class="settings-section-title">Account Safety & Session</div>
                
                <div class="settings-row">
                  <div class="settings-row-label">
                    <div class="settings-row-title">Watch History</div>
                    <div class="settings-row-desc">Permanently delete your entire watch history. This cannot be undone.</div>
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

            <!-- Tab: Admin Controls -->
            ${isAdmin ? `
            <div class="settings-tab-panel" id="panel-admin">
              <div class="settings-section admin-section" style="border: 1px solid var(--accent); background: rgba(147, 51, 234, 0.04);">
                <div class="settings-section-title" style="color: var(--accent); font-weight: 700; border-bottom: 1px solid rgba(147, 51, 234, 0.15);">
                  🛡️ Admin Panel
                </div>
                
                <div class="settings-row" style="border: none;">
                  <div class="settings-row-label">
                    <div class="settings-row-title">Display Safe Search Toggle</div>
                    <div class="settings-row-desc">Allow all other users to toggle Safe Search on their Settings screen. If disabled, their toggle is hidden and Safe Search remains locked to active/default.</div>
                  </div>
                  <label class="settings-toggle">
                    <input type="checkbox" id="admin-display-safesearch" ${globalConfig.showSafeSearchToggle !== false ? 'checked' : ''} />
                    <span class="settings-toggle-track"></span>
                  </label>
                </div>
              </div>
            </div>
            ` : ''}

          </div>

        </div>
      </div>
    </div>
    ${createFooter()}`;

  // ---- Live preference saving ----
  let parentalPin = prefs.parentalPin || '';

  // Inject PIN modal styles
  if (!document.getElementById('pin-modal-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'pin-modal-styles';
    styleEl.innerHTML = `
      .pin-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(8px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.25s ease;
      }
      .pin-modal-card {
        background: rgba(20, 20, 25, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        width: 90%;
        max-width: 360px;
        padding: 30px;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .pin-modal-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
      }
      .pin-modal-icon {
        font-size: 36px;
      }
      .pin-modal-card h3 {
        margin: 0;
        font-size: 20px;
        color: #fff;
      }
      .pin-modal-card p {
        color: var(--text-dim);
        font-size: 14px;
        line-height: 1.5;
        margin: 0 0 20px;
      }
      .pin-input-row {
        display: flex;
        justify-content: center;
        margin-bottom: 15px;
      }
      .pin-input-row input {
        background: rgba(255, 255, 255, 0.05) !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        color: #fff !important;
        font-size: 28px !important;
        letter-spacing: 8px !important;
        text-align: center !important;
        padding: 10px !important;
        border-radius: 8px !important;
        width: 160px !important;
        outline: none !important;
        transition: all 0.2s !important;
      }
      .pin-input-row input:focus {
        border-color: #ff0055 !important;
        background: rgba(255, 0, 85, 0.05) !important;
        box-shadow: 0 0 10px rgba(255, 0, 85, 0.2) !important;
      }
      .pin-error-msg {
        color: #ff3366;
        font-size: 13px;
        margin-bottom: 15px;
        min-height: 18px;
        font-weight: 500;
      }
      .pin-modal-actions {
        display: flex;
        gap: 12px;
      }
      .pin-modal-actions button {
        flex: 1;
        padding: 12px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .pin-btn-cancel {
        background: rgba(255, 255, 255, 0.08) !important;
        color: #fff !important;
      }
      .pin-btn-cancel:hover {
        background: rgba(255, 255, 255, 0.12) !important;
      }
      .pin-btn-confirm {
        background: #ff0055 !important;
        color: #fff !important;
      }
      .pin-btn-confirm:hover {
        background: #e6004c !important;
      }
    `;
    document.head.appendChild(styleEl);
  }

  const showPinModal = (hasPin, correctPin) => {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'pin-modal-overlay';
      
      overlay.innerHTML = `
        <div class="pin-modal-card">
          <div class="pin-modal-header">
            <span class="pin-modal-icon">🔒</span>
            <h3>${hasPin ? 'Enter Parental PIN' : 'Create Parental PIN'}</h3>
          </div>
          <p>${hasPin ? 'Please enter your 4-digit parental PIN to disable SafeSearch.' : 'Create a 4-digit PIN to lock SafeSearch and adult content.'}</p>
          <div class="pin-input-row">
            <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••" id="parental-pin-input" autocomplete="off" autofocus />
          </div>
          <div class="pin-error-msg" id="pin-error-msg"></div>
          <div class="pin-modal-actions">
            <button class="pin-btn-cancel" id="pin-btn-cancel">Cancel</button>
            <button class="pin-btn-confirm" id="pin-btn-confirm">${hasPin ? 'Confirm' : 'Create'}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('#parental-pin-input');
      const errorMsg = overlay.querySelector('#pin-error-msg');
      const btnCancel = overlay.querySelector('#pin-btn-cancel');
      const btnConfirm = overlay.querySelector('#pin-btn-confirm');

      input?.focus();

      const close = (value) => {
        overlay.remove();
        resolve(value);
      };

      btnCancel?.addEventListener('click', () => close(null));

      const submit = () => {
        const pinVal = input.value.trim();
        if (!/^\d{4}$/.test(pinVal)) {
          errorMsg.textContent = 'PIN must be exactly 4 digits.';
          input.value = '';
          input.focus();
          return;
        }

        if (hasPin) {
          if (pinVal === correctPin) {
            close(pinVal);
          } else {
            errorMsg.textContent = 'Incorrect Parental PIN. Access denied.';
            input.value = '';
            input.focus();
          }
        } else {
          close(pinVal);
        }
      };

      btnConfirm?.addEventListener('click', submit);
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });
  };

  const save = async () => {
    const newPrefs = {
      autoplay: document.getElementById('pref-autoplay')?.checked ?? true,
      quality:  document.getElementById('pref-quality')?.value  ?? 'auto',
      language: document.getElementById('pref-language')?.value ?? 'all',
      safeSearch: document.getElementById('pref-safesearch') 
        ? document.getElementById('pref-safesearch').checked 
        : (prefs.safeSearch ?? true),
      parentalPin: parentalPin
    };
    await saveSettings(user.uid, newPrefs);
    localStorage.setItem('piq_safesearch', newPrefs.safeSearch ? 'true' : 'false');
    refreshSidebarNav();
    showToast('✓ Settings saved');
  };

  const updatePinActions = () => {
    const containerActions = container.querySelector('#parental-pin-actions');
    if (!containerActions) return;
    containerActions.innerHTML = parentalPin 
      ? `<a href="#" id="change-parental-pin" style="color: #ff0055; text-decoration: none; font-size: 13px; font-weight: 500; display: inline-block;">Change Parental PIN</a>`
      : '';
    
    container.querySelector('#change-parental-pin')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (parentalPin) {
        const verifyPin = await showPinModal(true, parentalPin);
        if (verifyPin === parentalPin) {
          const newPin = await showPinModal(false, '');
          if (newPin) {
            parentalPin = newPin;
            await save();
            updatePinActions();
            showToast('✓ Parental PIN updated');
          }
        }
      }
    });
  };

  // Wire event listeners
  container.querySelector('#pref-autoplay')?.addEventListener('change', save);
  container.querySelector('#pref-quality')?.addEventListener('change', save);
  container.querySelector('#pref-language')?.addEventListener('change', save);

  const safesearchCheckbox = container.querySelector('#pref-safesearch');
  safesearchCheckbox?.addEventListener('change', async () => {
    const isChecked = safesearchCheckbox.checked;

    if (!isChecked) {
      // Temporarily revert checked state during PIN validation:
      safesearchCheckbox.checked = true;

      const userPin = await showPinModal(!!parentalPin, parentalPin);
      if (userPin) {
        if (!parentalPin) {
          parentalPin = userPin;
        }
        safesearchCheckbox.checked = false;
        await save();
        updatePinActions();
      } else {
        safesearchCheckbox.checked = true;
      }
    } else {
      await save();
    }
  });

  // Setup initial link state
  updatePinActions();

  // Clear history
  container.querySelector('#settings-clear-history')?.addEventListener('click', async () => {
    if (!confirm('Delete your entire watch history? This cannot be undone.')) return;
    await clearAllWatchHistory(user.uid);
    showToast('✓ Watch history cleared');
  });

  // Admin Controls
  container.querySelector('#admin-display-safesearch')?.addEventListener('change', async () => {
    const isChecked = container.querySelector('#admin-display-safesearch').checked;
    await saveGlobalConfig({ showSafeSearchToggle: isChecked });
    showToast('✓ System controls updated');
  });

  // Sign out
  container.querySelector('#settings-signout')?.addEventListener('click', async () => {
    await logout();
    navigate('/');
  });

  // Tab Switching event wiring
  container.querySelectorAll('.settings-nav-sidebar .settings-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.settings-nav-sidebar .settings-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      container.querySelectorAll('.settings-content-panes .settings-tab-panel').forEach(panel => panel.classList.remove('active'));
      const targetPanel = container.querySelector(`#panel-${btn.dataset.tab}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
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
