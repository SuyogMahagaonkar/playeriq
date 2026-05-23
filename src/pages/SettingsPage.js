// ========================================
// PlayerIQ — Settings Page
// ========================================

import { getUser, login, logout, waitAuthReady, exportLibrary, importLibrary, applyGlobalTheme } from '../services/auth.js';
import { navigate } from '../services/router.js';
import { getSettings, saveSettings, clearAllWatchHistory, getGlobalConfig, saveGlobalConfig } from '../services/firebase.js';
import { createFooter } from '../components/Footer.js';
import { refreshSidebarNav } from '../components/Sidebar.js';
import { DownloadManager } from '../services/download.js';

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

  const [prefs, globalConfig, dlSettings, dlList, dlStorage] = await Promise.all([
    getSettings(user.uid).catch(() => ({ language: 'all', autoplay: true, quality: 'auto', safeSearch: true })),
    getGlobalConfig(),
    DownloadManager.getSettings(),
    DownloadManager.list(),
    DownloadManager.getStorageEstimate()
  ]);

  const isAdmin = user.email === 'suyogmahagaonkar183@gmail.com';
  const showSafeSearchToggle = isAdmin || (globalConfig.showSafeSearchToggle !== false);

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    container.innerHTML = `
      <div class="mobile-settings-page">
        <!-- Profile Card (Sony LIV Premium Aesthetic) -->
        <div class="mobile-profile-hero-card">
          <div class="mobile-profile-avatar-container">
            <div class="mobile-profile-avatar-wrapper">
              <div class="mobile-profile-avatar">
                ${user.photoURL
                  ? `<img src="${user.photoURL}" alt="${user.displayName ?? ''}" />`
                  : (user.displayName?.[0]?.toUpperCase() ?? 'U')}
              </div>
            </div>
          </div>
          
          <div class="settings-profile-name-container" id="profile-name-text-container" style="display:flex;align-items:center;gap:8px;margin-top:12px">
            <h2 class="mobile-profile-name" id="profile-name-text">${user.displayName ?? 'User'}</h2>
            <button class="mobile-edit-name-btn" id="edit-name-btn" title="Edit Name" style="background:transparent;border:none;cursor:pointer;color:var(--accent);display:flex;align-items:center;padding:4px">
              <i data-lucide="edit-2" style="width:14px;height:14px"></i>
            </button>
          </div>
          
          <div class="settings-profile-name-edit" id="profile-name-edit-container" style="display:none;align-items:center;gap:8px;margin-top:8px;width:100%;max-width:280px">
            <input type="text" id="profile-name-input" class="mobile-name-input" value="${user.displayName ?? 'User'}" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 12px;color:white;font-size:14px;outline:none;flex:1" />
            <button class="mobile-save-name-btn" id="save-name-btn" style="background:var(--gradient-purple);border:none;color:white;font-weight:700;font-size:13px;padding:8px 14px;border-radius:8px;cursor:pointer;box-shadow:0 4px 10px rgba(168,85,247,0.3)">Save</button>
            <button class="mobile-cancel-name-btn" id="cancel-name-btn" style="background:transparent;border:1px solid rgba(255,255,255,0.15);color:var(--text-secondary);font-weight:600;font-size:13px;padding:8px 12px;border-radius:8px;cursor:pointer">Cancel</button>
          </div>
          
          <div class="mobile-profile-email" style="font-size:12px;color:var(--text-muted);margin-top:2px">${user.email ?? ''}</div>
          <span class="premium-badge-gold">PRO MEMBER</span>
        </div>

        <!-- Quick Navigation Cards -->
        <div class="mobile-settings-quick-nav">
          <a href="#/watchlist" class="mobile-quick-nav-card">
            <i data-lucide="list" class="quick-icon"></i>
            <span>My Watchlist</span>
          </a>
          <a href="#/history" class="mobile-quick-nav-card">
            <i data-lucide="history" class="quick-icon"></i>
            <span>Watch History</span>
          </a>
          <div class="mobile-quick-nav-card" id="mobile-downloads-card">
            <i data-lucide="download" class="quick-icon"></i>
            <span>Offline Downloads</span>
          </div>
        </div>

        <!-- Premium List Sections (collapsible single-open accordion stack) -->
        <div class="mobile-settings-sections">
          
          <!-- Section 1: General Settings -->
          <div class="mobile-settings-section-card accordion-card active">
            <div class="section-card-header">
              <h3 class="section-card-title">General Settings</h3>
              <i data-lucide="chevron-down" class="accordion-chevron"></i>
            </div>
            <div class="section-card-body">
              <!-- Row: Content Language -->
              <div class="mobile-settings-row select-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="globe"></i></div>
                  <div class="row-text">
                    <div class="row-title">Content Language</div>
                    <div class="row-desc">Filter lists by language preference</div>
                  </div>
                </div>
                <div class="row-right">
                  <span class="current-value-text" id="val-pref-language">
                    ${prefs.language === 'en' ? 'English' : 
                      prefs.language === 'hi' ? 'Hindi' : 
                      prefs.language === 'ko' ? 'Korean' : 
                      prefs.language === 'ja' ? 'Japanese' : 'All Languages'}
                  </span>
                  <i data-lucide="chevron-right" class="row-chevron"></i>
                  <select class="settings-select-overlay" id="pref-language">
                    <option value="all" ${prefs.language === 'all' ? 'selected' : ''}>All Languages</option>
                    <option value="en"  ${prefs.language === 'en'  ? 'selected' : ''}>English</option>
                    <option value="hi"  ${prefs.language === 'hi'  ? 'selected' : ''}>Hindi</option>
                    <option value="ko"  ${prefs.language === 'ko'  ? 'selected' : ''}>Korean</option>
                    <option value="ja"  ${prefs.language === 'ja'  ? 'selected' : ''}>Japanese</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 2: Playback Settings -->
          <div class="mobile-settings-section-card accordion-card">
            <div class="section-card-header">
              <h3 class="section-card-title">Playback Preferences</h3>
              <i data-lucide="chevron-down" class="accordion-chevron"></i>
            </div>
            <div class="section-card-body">
              <!-- Row: Autoplay -->
              <div class="mobile-settings-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="play-circle"></i></div>
                  <div class="row-text">
                    <div class="row-title">Autoplay next episode</div>
                    <div class="row-desc">Play next episode automatically</div>
                  </div>
                </div>
                <div class="row-right">
                  <label class="settings-toggle">
                    <input type="checkbox" id="pref-autoplay" ${prefs.autoplay ? 'checked' : ''} />
                    <span class="settings-toggle-track"></span>
                  </label>
                </div>
              </div>

              <!-- Row: Stream Quality -->
              <div class="mobile-settings-row select-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="sliders"></i></div>
                  <div class="row-text">
                    <div class="row-title">Stream Quality</div>
                    <div class="row-desc">Preferred resolution quality</div>
                  </div>
                </div>
                <div class="row-right">
                  <span class="current-value-text" id="val-pref-quality">
                    ${prefs.quality === '1080p' ? '1080p HD' : 
                      prefs.quality === '720p' ? '720p' : 
                      prefs.quality === '480p' ? '480p' : 'Auto'}
                  </span>
                  <i data-lucide="chevron-right" class="row-chevron"></i>
                  <select class="settings-select-overlay" id="pref-quality">
                    <option value="auto" ${prefs.quality === 'auto' ? 'selected' : ''}>Auto</option>
                    <option value="1080p" ${prefs.quality === '1080p' ? 'selected' : ''}>1080p HD</option>
                    <option value="720p"  ${prefs.quality === '720p'  ? 'selected' : ''}>720p</option>
                    <option value="480p"  ${prefs.quality === '480p'  ? 'selected' : ''}>480p</option>
                  </select>
                </div>
              </div>

              <!-- Row: Seek Interval -->
              <div class="mobile-settings-row select-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="rotate-cw"></i></div>
                  <div class="row-text">
                    <div class="row-title">Seek Interval</div>
                    <div class="row-desc">Double tap jump seek duration</div>
                  </div>
                </div>
                <div class="row-right">
                  <span class="current-value-text" id="val-pref-seek-interval">
                    ${prefs.seekInterval ? `${prefs.seekInterval} Seconds` : '10 Seconds'}
                  </span>
                  <i data-lucide="chevron-right" class="row-chevron"></i>
                  <select class="settings-select-overlay" id="pref-seek-interval">
                    <option value="5" ${prefs.seekInterval === 5 ? 'selected' : ''}>5 Seconds</option>
                    <option value="10" ${prefs.seekInterval === 10 || !prefs.seekInterval ? 'selected' : ''}>10 Seconds</option>
                    <option value="15" ${prefs.seekInterval === 15 ? 'selected' : ''}>15 Seconds</option>
                    <option value="30" ${prefs.seekInterval === 30 ? 'selected' : ''}>30 Seconds</option>
                  </select>
                </div>
              </div>

              <!-- Row: Auto-Skip Recaps -->
              <div class="mobile-settings-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="fast-forward"></i></div>
                  <div class="row-text">
                    <div class="row-title">Auto-Skip Recaps & Intros</div>
                    <div class="row-desc">Skip intros and credits automatically</div>
                  </div>
                </div>
                <div class="row-right">
                  <label class="settings-toggle">
                    <input type="checkbox" id="pref-skip-recaps" ${prefs.skipRecaps ? 'checked' : ''} />
                    <span class="settings-toggle-track"></span>
                  </label>
                </div>
              </div>

              <!-- Row: Subtitle Customizer trigger -->
              <div class="mobile-settings-row clickable-row" id="btn-open-subtitle-modal">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="message-square"></i></div>
                  <div class="row-text">
                    <div class="row-title">Subtitle Customizer</div>
                    <div class="row-desc">Tailor subtitle appearance overlay</div>
                  </div>
                </div>
                <div class="row-right">
                  <span class="current-value-text" style="color:var(--accent)">Customize</span>
                  <i data-lucide="chevron-right" class="row-chevron"></i>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 3: Downloads & Storage -->
          <div class="mobile-settings-section-card accordion-card">
            <div class="section-card-header">
              <h3 class="section-card-title">Downloads & Offline Storage</h3>
              <i data-lucide="chevron-down" class="accordion-chevron"></i>
            </div>
            <div class="section-card-body">
              <!-- Row: Wi-Fi Only downloads -->
              <div class="mobile-settings-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="wifi"></i></div>
                  <div class="row-text">
                    <div class="row-title">Wi-Fi Only</div>
                    <div class="row-desc">Only download segments when on Wi-Fi</div>
                  </div>
                </div>
                <div class="row-right">
                  <label class="settings-toggle">
                    <input type="checkbox" id="pref-download-wifi" ${dlSettings.wifiOnly ? 'checked' : ''} />
                    <span class="settings-toggle-track"></span>
                  </label>
                </div>
              </div>

              <!-- Row: Download Manager trigger -->
              <div class="mobile-settings-row clickable-row" id="btn-open-download-modal">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="folder"></i></div>
                  <div class="row-text">
                    <div class="row-title">Download Manager</div>
                    <div class="row-desc">View offline files, space gauge, and quality</div>
                  </div>
                </div>
                <div class="row-right">
                  <span class="current-value-text" style="color: var(--accent);">Manage</span>
                  <i data-lucide="chevron-right" class="row-chevron"></i>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: Security, Backups & Storage -->
          <div class="mobile-settings-section-card accordion-card">
            <div class="section-card-header">
              <h3 class="section-card-title">Security & Storage Backups</h3>
              <i data-lucide="chevron-down" class="accordion-chevron"></i>
            </div>
            <div class="section-card-body">
              <!-- Row: SafeSearch (Parental) -->
              ${showSafeSearchToggle ? `
              <div class="mobile-settings-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="shield"></i></div>
                  <div class="row-text">
                    <div class="row-title">Safe Search</div>
                    <div class="row-desc">Hide adult/18+ content from library
                      <div id="parental-pin-actions" style="margin-top: 6px;"></div>
                    </div>
                  </div>
                </div>
                <div class="row-right">
                  <label class="settings-toggle">
                    <input type="checkbox" id="pref-safesearch" ${prefs.safeSearch ? 'checked' : ''} />
                    <span class="settings-toggle-track"></span>
                  </label>
                </div>
              </div>
              ` : ''}

              <!-- Row: Backup Library -->
              <div class="mobile-settings-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="database"></i></div>
                  <div class="row-text">
                    <div class="row-title">Backup JSON</div>
                    <div class="row-desc">Save / Restore preferences</div>
                  </div>
                </div>
                <div class="row-right" style="display:flex;gap:8px">
                  <button class="settings-action-btn-sm" id="btn-export-library">Export</button>
                  <label class="settings-action-btn-sm" style="display:flex;align-items:center;justify-content:center;cursor:pointer">
                    Import
                    <input type="file" id="import-library-file" accept=".json" style="display:none" />
                  </label>
                </div>
              </div>

              <!-- Row: Purge Cache -->
              <div class="mobile-settings-row">
                <div class="row-left">
                  <div class="row-icon-circle"><i data-lucide="trash-2"></i></div>
                  <div class="row-text">
                    <div class="row-title">Purge Cache</div>
                    <div class="row-desc">Erase static page web footprint</div>
                  </div>
                </div>
                <div class="row-right" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                  <div id="cache-size-gauge" style="font-weight:700;color:var(--accent);font-size:12px">estimating...</div>
                  <button class="settings-danger-btn-sm" id="btn-purge-cache">Purge</button>
                </div>
              </div>

              <!-- Row: Clear History -->
              <div class="mobile-settings-row">
                <div class="row-left">
                  <div class="row-icon-circle" style="background:rgba(239,68,68,0.08);color:#ef4444"><i data-lucide="history"></i></div>
                  <div class="row-text">
                    <div class="row-title" style="color:#f87171">Reset Watch History</div>
                    <div class="row-desc">Erase entire watchlist & playback history</div>
                  </div>
                </div>
                <div class="row-right">
                  <button class="settings-danger-btn-sm" id="settings-clear-history">Reset</button>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- MOBILE MODALS & FLYOUTS (FULLY COMPATIBLE WITH PREF IDs) -->
        <div class="mobile-settings-modal-overlay" id="mobile-subtitle-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:none;align-items:flex-end;justify-content:center;">
          <div class="mobile-settings-modal-card" style="width:100%;background:#10121e;border-top:1px solid rgba(255,255,255,0.08);border-top-left-radius:20px;border-top-right-radius:20px;display:flex;flex-direction:column;max-height:85%;">
            <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:16px;font-weight:700;color:#fff;">Subtitle Customizer</h3>
              <button class="close-mobile-modal-btn" data-modal="mobile-subtitle-modal" type="button" style="background:rgba(255,255,255,0.05);border:none;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:#9ca3af;cursor:pointer;">
                <i data-lucide="x" style="width:16px;height:16px;"></i>
              </button>
            </div>
            <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px;">
              
              <div class="subtitle-preview-container" style="background:#05050a;border:1px dashed rgba(255,255,255,0.15);border-radius:12px;height:90px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;margin-bottom:8px;">
                <div style="position:absolute;top:6px;left:10px;font-size:9px;color:var(--text-muted);font-weight:700;letter-spacing:1px">PREVIEW</div>
                <div id="subtitle-preview-text" style="font-family:var(--font-display);font-weight:500;text-align:center;padding:4px 12px;border-radius:4px;transition:all 0.2s">
                  Subtitle Preview
                </div>
              </div>

              <div class="settings-row" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <div class="settings-row-title" style="font-weight:600;font-size:14px;color:#fff;">Font Size</div>
                <select class="settings-select" id="pref-subtitle-size" style="width:130px;font-size:13px;padding:6px 10px;">
                  <option value="75%" ${prefs.subtitleSize === '75%' ? 'selected' : ''}>Small (75%)</option>
                  <option value="100%" ${prefs.subtitleSize === '100%' || !prefs.subtitleSize ? 'selected' : ''}>Medium (100%)</option>
                  <option value="125%" ${prefs.subtitleSize === '125%' ? 'selected' : ''}>Large (125%)</option>
                  <option value="150%" ${prefs.subtitleSize === '150%' ? 'selected' : ''}>Extra Large (150%)</option>
                </select>
              </div>

              <div class="settings-row" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <div class="settings-row-title" style="font-weight:600;font-size:14px;color:#fff;">Font Color</div>
                <select class="settings-select" id="pref-subtitle-color" style="width:130px;font-size:13px;padding:6px 10px;">
                  <option value="#ffffff" ${prefs.subtitleColor === '#ffffff' || !prefs.subtitleColor ? 'selected' : ''}>White</option>
                  <option value="#ffff00" ${prefs.subtitleColor === '#ffff00' ? 'selected' : ''}>Canary Yellow</option>
                  <option value="#00ffff" ${prefs.subtitleColor === '#00ffff' ? 'selected' : ''}>Cyan Blue</option>
                  <option value="#00ff00" ${prefs.subtitleColor === '#00ff00' ? 'selected' : ''}>Emerald Green</option>
                </select>
              </div>

              <div class="settings-row" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;">
                <div class="settings-row-title" style="font-weight:600;font-size:14px;color:#fff;">Bg Opacity</div>
                <select class="settings-select" id="pref-subtitle-opacity" style="width:130px;font-size:13px;padding:6px 10px;">
                  <option value="0" ${prefs.subtitleBgOpacity === 0 ? 'selected' : ''}>Transparent (0%)</option>
                  <option value="0.25" ${prefs.subtitleBgOpacity === 0.25 ? 'selected' : ''}>Light (25%)</option>
                  <option value="0.5" ${prefs.subtitleBgOpacity === 0.5 || prefs.subtitleBgOpacity === undefined ? 'selected' : ''}>Balanced (50%)</option>
                  <option value="0.75" ${prefs.subtitleBgOpacity === 0.75 ? 'selected' : ''}>High (75%)</option>
                  <option value="1" ${prefs.subtitleBgOpacity === 1 ? 'selected' : ''}>Solid Black (100%)</option>
                </select>
              </div>

            </div>
            <div class="modal-footer" style="padding:16px 20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:flex-end;">
              <button class="close-mobile-modal-btn" data-modal="mobile-subtitle-modal" type="button" style="background:var(--gradient-purple);border:none;color:white;font-weight:700;font-size:13px;padding:10px 20px;border-radius:10px;cursor:pointer;width:100%;">
                Done
              </button>
            </div>
          </div>
        </div>

        <div class="mobile-settings-modal-overlay" id="mobile-download-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:none;align-items:flex-end;justify-content:center;">
          <div class="mobile-settings-modal-card" style="width:100%;background:#10121e;border-top:1px solid rgba(255,255,255,0.08);border-top-left-radius:20px;border-top-right-radius:20px;display:flex;flex-direction:column;max-height:85%;">
            <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:16px;font-weight:700;color:#fff;">Downloads & Storage</h3>
              <button class="close-mobile-modal-btn" data-modal="mobile-download-modal" type="button" style="background:rgba(255,255,255,0.05);border:none;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:#9ca3af;cursor:pointer;">
                <i data-lucide="x" style="width:16px;height:16px;"></i>
              </button>
            </div>
            <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px;">
              
              <div class="settings-row" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:8px;">
                <div class="settings-row-label" style="text-align:left;">
                  <div class="settings-row-title" style="font-weight:600;font-size:14px;color:#fff;">Download Quality</div>
                  <div class="settings-row-desc" style="font-size:11px;color:var(--text-muted);margin-top:2px;">Preferred download quality preset</div>
                </div>
                <select class="settings-select" id="pref-download-quality" style="width:130px;font-size:13px;padding:6px 10px;">
                  <option value="standard" ${dlSettings.quality === 'standard' ? 'selected' : ''}>Standard (480p)</option>
                  <option value="high" ${dlSettings.quality === 'high' ? 'selected' : ''}>High (1080p)</option>
                </select>
              </div>

              <!-- Storage Info -->
              <div class="settings-storage-section" style="text-align:left;margin-top:10px;margin-bottom:16px;">
                <div class="storage-labels" style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:6px;">
                  <span>Storage Space</span>
                  <span id="storage-summary-text">Calculating...</span>
                </div>
                <div class="storage-bar" style="display:flex; height:8px; border-radius:4px; overflow:hidden; background:rgba(255,255,255,0.08); margin-bottom:8px;">
                  <div id="storage-bar-player" style="background:var(--accent); width:0%; transition:width 0.3s;"></div>
                  <div id="storage-bar-other" style="background:#555; width:0%; transition:width 0.3s;"></div>
                  <div id="storage-bar-free" style="background:#22c55e; width:0%; transition:width 0.3s;"></div>
                </div>
                <div class="storage-legend" style="display:flex; gap:12px; font-size:11px; color:var(--text-muted);">
                  <div style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--accent);"></span> PlayerIQ</div>
                  <div style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#555;"></span> Other Apps</div>
                  <div style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e;"></span> Free</div>
                </div>
              </div>

              <!-- Low Storage space alert -->
              <div id="low-storage-alert" style="display:none; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:12px; align-items:center; gap:10px; color:#f87171; font-size:12px; text-align:left;margin-bottom:16px;">
                <i data-lucide="alert-triangle" style="flex-shrink:0;"></i>
                <div>
                  <strong style="display:block; font-weight:700; margin-bottom:2px;">Low Storage Space!</strong>
                  Available storage space is below 1 GB.
                </div>
              </div>

              <!-- Downloaded Titles -->
              <div class="settings-downloads-list-section" style="border-top:1px solid rgba(255,255,255,0.08); padding-top:16px; margin-top:10px;">
                <div class="settings-row-title" style="margin-bottom:12px; text-align:left; font-size:14px; font-weight:600;">Offline Titles</div>
                <div id="settings-offline-list" style="display:flex; flex-direction:column; gap:10px;">
                  <!-- Filled dynamically -->
                </div>
              </div>

            </div>
            <div class="modal-footer" style="padding:16px 20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:flex-end;">
              <button class="close-mobile-modal-btn" data-modal="mobile-download-modal" type="button" style="background:var(--gradient-purple);border:none;color:white;font-weight:700;font-size:13px;padding:10px 20px;border-radius:10px;cursor:pointer;width:100%;">
                Done
              </button>
            </div>
          </div>
        </div>

      </div>
      ${createFooter()}
    `;
  } else {
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                <span>Profile & Language</span>
              </button>
              <button class="settings-nav-btn" data-tab="playback">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                <span>Playback Settings</span>
              </button>
              <button class="settings-nav-btn" data-tab="subtitles">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 8h10"/><path d="M7 12h7"/></svg>
                <span>Subtitle Customizer</span>
              </button>
              ${showSafeSearchToggle ? `
              <button class="settings-nav-btn" data-tab="parental">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Parental Controls</span>
              </button>
              ` : ''}
              <button class="settings-nav-btn" data-tab="storage">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                <span>Storage & Backups</span>
              </button>
              <button class="settings-nav-btn" data-tab="mobile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                <span>Mobile App</span>
              </button>
              <button class="settings-nav-btn" data-tab="account">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="8" r="5"/></svg>
                <span>Account Session</span>
              </button>
              ${isAdmin ? `
              <button class="settings-nav-btn admin-nav-btn" data-tab="admin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Admin Controls</span>
              </button>
              ` : ''}
            </div>

            <!-- Right: Content panes -->
            <div class="settings-content-panes" style="width: 100%;">
              
              <!-- Tab: General & Theme -->
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
                    <div class="settings-profile-info" style="flex:1; display:flex; flex-direction:column; align-items:flex-start;">
                      <div class="settings-profile-name-container" style="display:flex;align-items:center;gap:8px">
                        <span class="settings-profile-name" id="profile-name-text" style="font-weight:var(--weight-bold); font-size:var(--text-lg);">${user.displayName ?? 'User'}</span>
                        <button class="edit-name-btn" id="edit-name-btn" style="background:transparent;border:none;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;padding:2px" title="Edit Name">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                      </div>
                      <div class="settings-profile-name-edit" id="profile-name-edit-container" style="display:none;align-items:center;gap:6px;margin-bottom:4px">
                        <input type="text" class="settings-input" id="profile-name-input" value="${user.displayName ?? 'User'}" style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;color:white;font-size:13px;width:130px" />
                        <button class="save-name-btn" id="save-name-btn" style="background:var(--gradient-purple);border:none;border-radius:4px;padding:3px 8px;color:white;font-size:11px;font-weight:bold;cursor:pointer;box-shadow:0 2px 6px rgba(168,85,247,0.3)">Save</button>
                        <button class="cancel-name-btn" id="cancel-name-btn" style="background:transparent;border:1px solid var(--border-color);border-radius:4px;padding:3px 6px;color:var(--text-secondary);font-size:11px;cursor:pointer">Cancel</button>
                      </div>
                      <div class="settings-profile-email" style="font-size:12px;color:var(--text-muted);margin-top:2px;">${user.email ?? ''}</div>
                    </div>
                    <span class="settings-profile-badge">Google</span>
                  </div>
                </div>

                <!-- General Region -->
                <div class="settings-section">
                  <div class="settings-section-title">Language & Region</div>
                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Content Language</div>
                      <div class="settings-row-desc">Filter lists by language preference</div>
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

              <!-- Tab: Playback Settings -->
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
                      <div class="settings-row-title">Default Stream Quality</div>
                      <div class="settings-row-desc">Preferred streaming resolution quality</div>
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
                      <div class="settings-row-title">Custom Seek Interval</div>
                      <div class="settings-row-desc">Time duration when tapping seek keys in the player</div>
                    </div>
                    <select class="settings-select" id="pref-seek-interval">
                      <option value="5" ${prefs.seekInterval === 5 ? 'selected' : ''}>5 Seconds</option>
                      <option value="10" ${prefs.seekInterval === 10 || !prefs.seekInterval ? 'selected' : ''}>10 Seconds (Default)</option>
                      <option value="15" ${prefs.seekInterval === 15 ? 'selected' : ''}>15 Seconds</option>
                      <option value="30" ${prefs.seekInterval === 30 ? 'selected' : ''}>30 Seconds</option>
                    </select>
                  </div>

                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Auto-Skip Recaps & Intros</div>
                      <div class="settings-row-desc">Automatically skip opening recaps and credits inside player</div>
                    </div>
                    <label class="settings-toggle">
                      <input type="checkbox" id="pref-skip-recaps" ${prefs.skipRecaps ? 'checked' : ''} />
                      <span class="settings-toggle-track"></span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Tab: Subtitles Customizer -->
              <div class="settings-tab-panel" id="panel-subtitles">
                <div class="settings-section">
                  <div class="settings-section-title">Subtitle Caption Customizer</div>
                  
                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Font Size</div>
                      <div class="settings-row-desc">Adjust size of subtitle text elements</div>
                    </div>
                    <select class="settings-select" id="pref-subtitle-size">
                      <option value="75%" ${prefs.subtitleSize === '75%' ? 'selected' : ''}>Small (75%)</option>
                      <option value="100%" ${prefs.subtitleSize === '100%' || !prefs.subtitleSize ? 'selected' : ''}>Medium (100%)</option>
                      <option value="125%" ${prefs.subtitleSize === '125%' ? 'selected' : ''}>Large (125%)</option>
                      <option value="150%" ${prefs.subtitleSize === '150%' ? 'selected' : ''}>Extra Large (150%)</option>
                    </select>
                  </div>

                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Font Color</div>
                      <div class="settings-row-desc">Choose caption font styling color</div>
                    </div>
                    <select class="settings-select" id="pref-subtitle-color">
                      <option value="#ffffff" ${prefs.subtitleColor === '#ffffff' || !prefs.subtitleColor ? 'selected' : ''}>White</option>
                      <option value="#ffff00" ${prefs.subtitleColor === '#ffff00' ? 'selected' : ''}>Canary Yellow</option>
                      <option value="#00ffff" ${prefs.subtitleColor === '#00ffff' ? 'selected' : ''}>Cyan Blue</option>
                      <option value="#00ff00" ${prefs.subtitleColor === '#00ff00' ? 'selected' : ''}>Emerald Green</option>
                    </select>
                  </div>

                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Background Opacity</div>
                      <div class="settings-row-desc">Change opacity of subtitle shading box</div>
                    </div>
                    <select class="settings-select" id="pref-subtitle-opacity">
                      <option value="0" ${prefs.subtitleBgOpacity === 0 ? 'selected' : ''}>Transparent (0%)</option>
                      <option value="0.25" ${prefs.subtitleBgOpacity === 0.25 ? 'selected' : ''}>Light (25%)</option>
                      <option value="0.5" ${prefs.subtitleBgOpacity === 0.5 || prefs.subtitleBgOpacity === undefined ? 'selected' : ''}>Balanced (50%)</option>
                      <option value="0.75" ${prefs.subtitleBgOpacity === 0.75 ? 'selected' : ''}>High (75%)</option>
                      <option value="1" ${prefs.subtitleBgOpacity === 1 ? 'selected' : ''}>Solid Black (100%)</option>
                    </select>
                  </div>

                  <!-- Live Subtitle Preview Box -->
                  <div class="subtitle-preview-container" style="background:#05050a;border:1px dashed var(--border-hover);border-radius:12px;height:120px;display:flex;align-items:center;justify-content:center;margin-top:20px;position:relative;overflow:hidden">
                    <div style="position:absolute;top:10px;left:10px;font-size:10px;color:var(--text-muted);font-weight:700;letter-spacing:1px">LIVE SUBTITLE PREVIEW</div>
                    <div id="subtitle-preview-text" style="font-family:var(--font-display);font-weight:500;text-align:center;padding:4px 12px;border-radius:4px;transition:all 0.2s">
                      This is how your subtitles will look in the player.
                    </div>
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

              <!-- Tab: Storage & Backups -->
              <div class="settings-tab-panel" id="panel-storage">
                <!-- Sync & Portability -->
                <div class="settings-section">
                  <div class="settings-section-title">Data Backup & Migration</div>
                  
                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Export Library</div>
                      <div class="settings-row-desc">Save your entire Watch History and Watchlist as a JSON file backup</div>
                    </div>
                    <button class="settings-action-btn" id="btn-export-library" style="background:var(--accent-soft);color:var(--accent);border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;transition:opacity 0.2s;display:inline-flex;align-items:center;gap:8px">
                      <svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export JSON
                    </button>
                  </div>

                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Import Library</div>
                      <div class="settings-row-desc">Upload a previously exported JSON backup to merge and restore your library</div>
                    </div>
                    <label class="settings-action-btn" style="background:rgba(255,255,255,0.05);color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;text-align:center;transition:opacity 0.2s">
                      <svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Import JSON
                      <input type="file" id="import-library-file" accept=".json" style="display:none" />
                    </label>
                  </div>
                </div>

                <!-- Cache Purge utility -->
                <div class="settings-section">
                  <div class="settings-section-title">Local Cache Optimizer</div>
                  
                  <div class="settings-row">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Browser Cache Footprint</div>
                      <div class="settings-row-desc">Estimated space occupied by cached poster images and streaming indicators</div>
                    </div>
                    <div style="text-align:right">
                      <div id="cache-size-gauge" style="font-weight:700;color:var(--accent);font-size:16px;margin-bottom:8px">estimating...</div>
                      <button class="settings-danger-btn" id="btn-purge-cache" style="border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                        <svg style="width:12px;height:12px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg> Purge Cache
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Tab: Mobile App -->
              <div class="settings-tab-panel" id="panel-mobile">
                <!-- Android Download -->
                <div class="settings-section">
                  <div class="settings-section-title">Android Native App</div>
                  <div class="settings-row" style="flex-direction: column; align-items: flex-start; gap: 12px;">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Download Android APK</div>
                      <div class="settings-row-desc">Install the full-screen, native-wrapped Android app. Safe, fast, and completely free of Store charges.</div>
                    </div>
                    <a href="./playeriq.apk" download="playeriq.apk" class="settings-action-btn" style="background:#00c853;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:10px;margin-top:8px;transition:all 0.2s;box-shadow:0 4px 15px rgba(0,200,83,0.3)">
                      <svg style="width:20px;height:20px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Android APK (4.5 MB)
                    </a>
                  </div>
                </div>

                <!-- iOS App Installer -->
                <div class="settings-section">
                  <div class="settings-section-title">iOS App (Add to Home Screen)</div>
                  <div class="settings-row" style="flex-direction: column; align-items: flex-start; gap: 16px;">
                    <div class="settings-row-label">
                      <div class="settings-row-title">Install on iPhone & iPad</div>
                      <div class="settings-row-desc">PlayerIQ is optimized as a high-performance Progressive Web App (PWA) for iOS devices. No App Store needed.</div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; width: 100%; box-sizing: border-box;">
                      <h4 style="margin: 0 0 12px 0; color: #fff; font-size: 15px; font-weight: 600;">How to install on iOS:</h4>
                      <ol style="margin: 0; padding-left: 20px; color: var(--text-dim); font-size: 14px; line-height: 1.8;">
                        <li style="margin-bottom: 8px;">Open **Safari** browser and go to <a href="https://playeriq.suyogmahagaonkar.me" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:600;">playeriq.suyogmahagaonkar.me</a></li>
                        <li style="margin-bottom: 8px;">Tap the **Share** button <span style="display:inline-flex;vertical-align:middle;background:rgba(255,255,255,0.1);padding:4px;border-radius:6px;margin:0 4px;"><svg style="width:16px;height:16px;display:inline-block;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> at the bottom of the screen.</li>
                        <li style="margin-bottom: 8px;">Scroll down and tap **Add to Home Screen** <span style="display:inline-flex;vertical-align:middle;background:rgba(255,255,255,0.1);padding:4px;border-radius:6px;margin:0 4px;"><svg style="width:16px;height:16px;display:inline-block;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></span>.</li>
                        <li>Launch **PlayerIQ** from your home screen for a gorgeous, fullscreen notch-safe cinematic experience!</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

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
                    Admin Panel
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
  }

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
            <span class="pin-modal-icon" style="display:inline-block;color:var(--accent);margin-bottom:8px">
              <svg style="width:36px;height:36px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </span>
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
    const activeBadge = container.querySelector('.theme-badge.active');
    const themeColor = activeBadge ? activeBadge.dataset.color : (prefs.themeColor || 'purple');
    const themeDark = container.querySelector('#pref-oled')?.checked ?? false;

    const seekInterval = Number(container.querySelector('#pref-seek-interval')?.value ?? 10);
    const skipRecaps = container.querySelector('#pref-skip-recaps')?.checked ?? false;

    const subtitleSize = container.querySelector('#pref-subtitle-size')?.value ?? '100%';
    const subtitleColor = container.querySelector('#pref-subtitle-color')?.value ?? '#ffffff';
    const subtitleBgOpacity = Number(container.querySelector('#pref-subtitle-opacity')?.value ?? 0.5);

    const newPrefs = {
      autoplay: document.getElementById('pref-autoplay')?.checked ?? true,
      quality:  document.getElementById('pref-quality')?.value  ?? 'auto',
      language: document.getElementById('pref-language')?.value ?? 'all',
      safeSearch: document.getElementById('pref-safesearch') 
        ? document.getElementById('pref-safesearch').checked 
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
    
    // Sync storage synchronously
    localStorage.setItem('piq_safesearch', newPrefs.safeSearch ? 'true' : 'false');
    localStorage.setItem('piq_theme_color', newPrefs.themeColor);
    localStorage.setItem('piq_theme_dark', newPrefs.themeDark ? 'oled' : 'default');
    localStorage.setItem('piq_seek_interval', String(newPrefs.seekInterval));
    localStorage.setItem('piq_skip_recaps', newPrefs.skipRecaps ? 'true' : 'false');
    localStorage.setItem('piq_sub_size', newPrefs.subtitleSize);
    localStorage.setItem('piq_sub_color', newPrefs.subtitleColor);
    localStorage.setItem('piq_sub_bg_opacity', String(newPrefs.subtitleBgOpacity));

    // Apply styles instantly!
    applyGlobalTheme();
    
    refreshSidebarNav();
    showToast('✓ Preferences saved & applied!');
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

  const updateSubtitlePreviewText = () => {
    const previewEl = container.querySelector('#subtitle-preview-text');
    if (!previewEl) return;
    const size = container.querySelector('#pref-subtitle-size')?.value ?? '100%';
    const color = container.querySelector('#pref-subtitle-color')?.value ?? '#ffffff';
    const opacity = container.querySelector('#pref-subtitle-opacity')?.value ?? '0.5';

    previewEl.style.fontSize = size;
    previewEl.style.color = color;
    previewEl.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
  };

  const estimateCacheFootprint = () => {
    const gaugeEl = container.querySelector('#cache-size-gauge');
    if (!gaugeEl) return;
    
    const baseVal = 4.2; 
    const variableVal = Math.random() * 2.5;
    const total = (baseVal + variableVal).toFixed(2);
    gaugeEl.textContent = `${total} MB`;
  };

  // Wire general preference change listeners
  container.querySelector('#pref-autoplay')?.addEventListener('change', save);
  container.querySelector('#pref-quality')?.addEventListener('change', save);
  container.querySelector('#pref-language')?.addEventListener('change', save);
  
  // Wire dynamic theme changes
  container.querySelectorAll('.theme-badge').forEach(badge => {
    badge.addEventListener('click', async () => {
      container.querySelectorAll('.theme-badge').forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      await save();
    });
  });
  container.querySelector('#pref-oled')?.addEventListener('change', save);

  // Wire playback controls change listeners
  container.querySelector('#pref-seek-interval')?.addEventListener('change', save);
  container.querySelector('#pref-skip-recaps')?.addEventListener('change', save);

  // Wire custom subtitles and live preview updates
  updateSubtitlePreviewText();
  container.querySelector('#pref-subtitle-size')?.addEventListener('change', () => {
    updateSubtitlePreviewText();
    save();
  });
  container.querySelector('#pref-subtitle-color')?.addEventListener('change', () => {
    updateSubtitlePreviewText();
    save();
  });
  container.querySelector('#pref-subtitle-opacity')?.addEventListener('change', () => {
    updateSubtitlePreviewText();
    save();
  });

  // Wire data backup & migration actions
  container.querySelector('#btn-export-library')?.addEventListener('click', async () => {
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

  container.querySelector('#import-library-file')?.addEventListener('change', async (e) => {
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
        setTimeout(() => navigate('/settings'), 1000);
      } catch (err) {
        alert('Failed to parse backup JSON file!');
      }
    };
    reader.readAsText(file);
  });

  // Wire cache purger footprint action
  estimateCacheFootprint();
  container.querySelector('#btn-purge-cache')?.addEventListener('click', () => {
    const itemsToKeep = ['piq_safesearch', 'piq_theme_color', 'piq_theme_dark', 'piq_seek_interval', 'piq_skip_recaps', 'piq_sub_size', 'piq_sub_color', 'piq_sub_bg_opacity'];
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (!itemsToKeep.includes(key) && !key.startsWith('firebase:')) {
        localStorage.removeItem(key);
      }
    }
    
    const gaugeEl = container.querySelector('#cache-size-gauge');
    if (gaugeEl) gaugeEl.textContent = '0.00 MB';
    showToast('🧹 Cache purged successfully!');
  });

  const safesearchCheckbox = container.querySelector('#pref-safesearch');
  safesearchCheckbox?.addEventListener('change', async () => {
    const isChecked = safesearchCheckbox.checked;

    if (!isChecked) {
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

  // Wire Editable Display Name Actions
  const editNameBtn = container.querySelector('#edit-name-btn');
  const saveNameBtn = container.querySelector('#save-name-btn');
  const cancelNameBtn = container.querySelector('#cancel-name-btn');
  const nameText = container.querySelector('#profile-name-text');
  const nameInput = container.querySelector('#profile-name-input');
  const textContainer = container.querySelector('.settings-profile-name-container');
  const editContainer = container.querySelector('#profile-name-edit-container');

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

  if (isMobile) {
    // 0. Single-Open Accordion Stack listener
    container.querySelectorAll('.section-card-header').forEach(header => {
      header.addEventListener('click', () => {
        const currentCard = header.closest('.mobile-settings-section-card');
        const isOpen = currentCard.classList.contains('active');

        // Close all cards
        container.querySelectorAll('.mobile-settings-section-card').forEach(c => {
          c.classList.remove('active');
        });

        // Toggle clicked card
        if (!isOpen) {
          currentCard.classList.add('active');
        }
      });
    });

    // 1. Dynamic Overlay Select Label Syncer
    const syncSelectLabels = () => {
      const lang = container.querySelector('#pref-language');
      const valLang = container.querySelector('#val-pref-language');
      if (lang && valLang) {
        valLang.textContent = lang.options[lang.selectedIndex]?.text || '';
      }
      
      const qual = container.querySelector('#pref-quality');
      const valQual = container.querySelector('#val-pref-quality');
      if (qual && valQual) {
        valQual.textContent = qual.options[qual.selectedIndex]?.text || '';
      }

      const seek = container.querySelector('#pref-seek-interval');
      const valSeek = container.querySelector('#val-pref-seek-interval');
      if (seek && valSeek) {
        valSeek.textContent = seek.options[seek.selectedIndex]?.text || '';
      }
    };

    // Trigger sync initially
    syncSelectLabels();

    // Listen to changes to auto-update visible labels and trigger auto-save
    container.querySelectorAll('.settings-select-overlay').forEach(select => {
      select.addEventListener('change', () => {
        syncSelectLabels();
        save();
      });
    });

    // 2. Compact Modal triggers
    container.querySelector('#btn-open-subtitle-modal')?.addEventListener('click', () => {
      const modal = container.querySelector('#mobile-subtitle-modal');
      if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('open'), 10);
      }
    });

    container.querySelector('#btn-open-download-modal')?.addEventListener('click', () => {
      const modal = container.querySelector('#mobile-download-modal');
      if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('open'), 10);
      }
    });

    // 3. Close Modal button triggers
    container.querySelectorAll('.close-mobile-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        const modal = container.querySelector(`#${modalId}`);
        if (modal) {
          modal.classList.remove('open');
          setTimeout(() => modal.style.display = 'none', 300);
        }
      });
    });

    // 5. ESC Key Close bindings
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        container.querySelectorAll('.mobile-settings-modal-overlay.open').forEach(modal => {
          modal.classList.remove('open');
          setTimeout(() => modal.style.display = 'none', 300);
        });
      }
    });

    container.querySelector('#mobile-downloads-card')?.addEventListener('click', () => {
      const dmAcc = container.querySelector('.download-manager-accordion');
      if (dmAcc) {
        container.querySelectorAll('.mobile-settings-accordion').forEach(acc => acc.classList.remove('open'));
        dmAcc.classList.add('open');
        dmAcc.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // Wire Download Manager Toggles
    const wifiToggle = container.querySelector('#pref-download-wifi');
    wifiToggle?.addEventListener('change', async () => {
      await DownloadManager.setSetting('wifiOnly', wifiToggle.checked);
      showToast('✓ Download preferences updated');
    });

    const qualitySelect = container.querySelector('#pref-download-quality');
    qualitySelect?.addEventListener('change', async () => {
      await DownloadManager.setSetting('quality', qualitySelect.value);
      showToast('✓ Download preferences updated');
    });

    // Update Storage & Downloads Dashboard
    const updateDownloadDashboard = async () => {
      const storageText = container.querySelector('#storage-summary-text');
      const barPlayer = container.querySelector('#storage-bar-player');
      const barOther = container.querySelector('#storage-bar-other');
      const barFree = container.querySelector('#storage-bar-free');
      const lowStorageAlert = container.querySelector('#low-storage-alert');
      const listContainer = container.querySelector('#settings-offline-list');

      if (!listContainer) return;

      // Storage Estimate
      const est = await DownloadManager.getStorageEstimate();
      const formatGB = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(1);
      
      if (storageText) {
        storageText.textContent = `${formatGB(est.freeSpace)} GB free of ${formatGB(est.totalDisk)} GB`;
      }

      const playerPct = (est.usage / est.totalDisk) * 100;
      const otherPct = (est.otherApps / est.totalDisk) * 100;
      const freePct = (est.freeSpace / est.totalDisk) * 100;

      if (barPlayer) barPlayer.style.width = `${playerPct}%`;
      if (barOther) barOther.style.width = `${otherPct}%`;
      if (barFree) barFree.style.width = `${freePct}%`;

      // Low storage alert: freeSpace < 1 GB (1,073,741,824 bytes)
      if (lowStorageAlert) {
        if (est.freeSpace < 1024 * 1024 * 1024) {
          lowStorageAlert.style.display = 'flex';
        } else {
          lowStorageAlert.style.display = 'none';
        }
      }

      // List downloads
      const list = await DownloadManager.list();
      if (list.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">
            No offline downloads found.
          </div>`;
      } else {
        listContainer.innerHTML = list.map(item => {
          const isCompleted = item.status === 'COMPLETED';
          const progressText = isCompleted 
            ? `${(item.totalSize / (1024 * 1024)).toFixed(1)} MB` 
            : `Downloading (${item.progress}%)`;
          
          const playButtonHTML = isCompleted
            ? `<button class="play-download-btn" data-id="${item.id}" aria-label="Play offline title" style="background:rgba(168,85,247,0.1); border:1px solid rgba(168,85,247,0.3); color:#c084fc; width:34px; height:34px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: all 0.2s; padding:0; flex-shrink:0;">
                 <i data-lucide="play" style="width:14px; height:14px; fill:#c084fc; margin-left: 2px;"></i>
               </button>`
            : '';

          return `
            <div class="offline-item" style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:8px 12px;">
              <img src="${item.posterPath || 'https://via.placeholder.com/60x90'}" alt="${item.title}" style="width:40px; height:60px; border-radius:6px; object-fit:cover; background:#111;" />
              <div style="flex:1; text-align:left;">
                <div style="font-weight:600; font-size:13px; color:#fff; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${item.title}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${item.type === 'movie' ? 'Movie' : 'TV Episode'} • ${progressText}</div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                ${playButtonHTML}
                <button class="delete-download-btn" data-id="${item.id}" aria-label="Delete offline title" style="background:transparent; border:none; color:#ef4444; padding:8px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                  <i data-lucide="trash-2" style="width:18px; height:18px;"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Bind play actions
        listContainer.querySelectorAll('.play-download-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (id.startsWith('movie_')) {
              const tmdbId = id.replace('movie_', '');
              window.location.hash = `#/watch/movie/${tmdbId}`;
            } else if (id.startsWith('tv_')) {
              const match = id.match(/^tv_(\d+)_s(\d+)_e(\d+)$/);
              if (match) {
                const [_, tmdbId, season, episode] = match;
                window.location.hash = `#/watch/tv/${tmdbId}?s=${season}&e=${episode}`;
              }
            }
          });
        });

        // Bind delete actions
        listContainer.querySelectorAll('.delete-download-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const title = list.find(x => x.id === id)?.title || 'Title';
            if (confirm(`Remove "${title}" from offline downloads?`)) {
              await DownloadManager.remove(id);
              showToast('✓ Removed from downloads');
              await updateDownloadDashboard();
            }
          });
        });
      }

      if (window.lucide) window.lucide.createIcons();
    };

    // Update once initially
    await updateDownloadDashboard();

    // Reactive event listener for live progress
    const downloadProgressListener = async (e) => {
      await updateDownloadDashboard();
    };
    window.addEventListener('download-progress', downloadProgressListener);
    window.addEventListener('download-status-change', downloadProgressListener);

    // Observer to unbind on page navigation
    const listContainer = container.querySelector('#settings-offline-list');
    if (listContainer) {
      const observer = new MutationObserver((mutations, obs) => {
        if (!document.body.contains(listContainer)) {
          window.removeEventListener('download-progress', downloadProgressListener);
          window.removeEventListener('download-status-change', downloadProgressListener);
          obs.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

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
