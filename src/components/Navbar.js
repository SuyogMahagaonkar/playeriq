// ========================================
// PlayerIQ — Navbar Component
// ========================================

import { navigate } from '../services/router.js';
import { searchMovieBox } from '../services/api.js';
import { addRecentSearch } from '../services/state.js';
import { toggleSidebar, refreshSidebarNav } from './Sidebar.js';
import { getUser, login, logout, onUserChange } from '../services/auth.js';

let searchTimeout = null;

export function createNavbar() {
  const navbar = document.createElement('header');
  navbar.className = 'navbar';
  navbar.id = 'navbar';

  navbar.innerHTML = `
    <div class="navbar-left">
      ${window.innerWidth <= 991 ? `
      <button class="navbar-hamburger" id="navbar-hamburger-btn" title="Open Menu">
        <i data-lucide="menu"></i>
      </button>
      ` : `
      <a href="#/" class="navbar-brand" id="navbar-brand-btn">
        <span class="navbar-brand-text">Player<span class="navbar-brand-accent">IQ</span></span>
      </a>
      `}
    </div>
    <div class="navbar-right">
      <div class="search-container" id="search-container">
        <div class="search-input-wrapper">
          <i data-lucide="search"></i>
          <input type="text" class="search-input" id="search-input" placeholder="Search movies, shows..." autocomplete="off" />
          <button class="search-voice" id="search-voice" title="Voice Search">
            <svg class="search-voice-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
          </button>
          <button class="search-clear" id="search-clear" style="display:none" title="Clear Search">
            <svg class="search-clear-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="search-suggestions" id="search-suggestions" style="display:none"></div>
      </div>
      
      <!-- Downloads Icon — hidden on desktop, visible only on mobile/tablet viewports -->
      ${(window.innerWidth <= 768) ? `
      <button class="navbar-btn navbar-btn-downloads-desktop" id="navbar-downloads" title="My Downloads" onclick="window.location.hash='/downloads'">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
      ` : ''}

      <!-- Notifications Wrapper -->
      <div style="position: relative; display: flex; align-items: center; gap: 8px;">
        <button class="navbar-btn" id="navbar-search-btn" title="Search" style="display: none;">
          <i data-lucide="search"></i>
        </button>
        <button class="navbar-btn" id="navbar-notif" title="Notifications">
          <i data-lucide="bell"></i>
        </button>
        <div class="notif-dropdown" id="notif-dropdown" style="display: none;">
          <div class="notif-dropdown-header">
            <h3>Notifications</h3>
            <button class="notif-clear-btn" id="notif-clear-btn">Clear All</button>
          </div>
          <div class="notif-dropdown-list" id="notif-dropdown-list">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>

      <!-- Profile Wrapper -->
      <div class="profile-wrapper" id="profile-wrapper">
        <button class="navbar-profile-btn" id="navbar-avatar" title="Profile" aria-haspopup="true" aria-expanded="false">
          <div class="navbar-avatar-inner">P</div>
          <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="navbar-mobile-welcome" id="navbar-mobile-welcome">
          <span class="welcome-text-small">Welcome Back</span>
          <span class="welcome-text-name" id="navbar-welcome-name">Guest</span>
        </div>
        <div class="profile-dropdown" id="profile-dropdown" role="menu">
          <!-- filled by JS -->
        </div>
      </div>
    </div>
  `;

  // Setup scroll listener and notification badge
  setTimeout(() => {
    setupNavbarScroll(navbar);
    refreshNotifBadge();
  }, 0);

  return navbar;
}

function setupNavbarScroll(navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });
}

// ---- Profile Dropdown Logic ----

function buildDropdownContent(user) {
  const dropdown = document.getElementById('profile-dropdown');
  if (!dropdown) return;

  if (user) {
    // ---- Signed-in view ----
    const avatarHtml = user.photoURL
      ? `<img src="${user.photoURL}" alt="${user.displayName ?? 'User'}" />`
      : `<span>${user.displayName?.[0]?.toUpperCase() ?? 'U'}</span>`;

    dropdown.innerHTML = `
      <div class="profile-dropdown-header">
        <div class="profile-dropdown-avatar" style="box-shadow: 0 0 15px var(--accent-glow);">${avatarHtml}</div>
        <div class="profile-dropdown-info">
          <div class="profile-dropdown-name">${user.displayName ?? 'User'}</div>
          <div class="profile-dropdown-email">${user.email ?? ''}</div>
        </div>
        <span class="profile-dropdown-badge">Pro</span>
      </div>

      <!-- User Passport Stats Panel -->
      <div class="profile-dropdown-stats">
        <div class="profile-stat-box" id="pd-stat-history" title="View Watch History">
          <span class="profile-stat-value" id="pd-stat-history-value">...</span>
          <span class="profile-stat-label">Watched</span>
        </div>
        <div class="profile-stat-box" id="pd-stat-watchlist" title="View Watchlist">
          <span class="profile-stat-value" id="pd-stat-watchlist-value">...</span>
          <span class="profile-stat-label">Watchlist</span>
        </div>
      </div>

      <div class="profile-dropdown-menu">
        <button class="profile-dropdown-item" id="pd-history" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Watch History
        </button>
        <button class="profile-dropdown-item" id="pd-watchlist" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          My Watchlist
        </button>
        ${(window.innerWidth <= 768) ? `
        <button class="profile-dropdown-item" id="pd-downloads" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          My Downloads
        </button>
        ` : ''}
        <button class="profile-dropdown-item" id="pd-settings" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
        <div class="profile-dropdown-sep"></div>
        <button class="profile-dropdown-item danger" id="pd-signout" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </div>
    `;

    // Events
    dropdown.querySelector('#pd-stat-history')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/history');
    });
    dropdown.querySelector('#pd-stat-watchlist')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/watchlist');
    });
    dropdown.querySelector('#pd-history')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/history');
    });
    dropdown.querySelector('#pd-watchlist')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/watchlist');
    });
    dropdown.querySelector('#pd-downloads')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/downloads');
    });
    dropdown.querySelector('#pd-settings')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/settings');
    });
    dropdown.querySelector('#pd-signout')?.addEventListener('click', async () => {
      closeDropdown();
      await logout();
    });

    // Asynchronously fetch and populate counts
    (async () => {
      try {
        const { fetchWatchlist, fetchWatchHistory } = await import('../services/firebase.js');
        const [watchlist, history] = await Promise.all([
          fetchWatchlist(user.uid).catch(() => []),
          fetchWatchHistory(user.uid).catch(() => [])
        ]);
        
        const wlVal = document.getElementById('pd-stat-watchlist-value');
        const histVal = document.getElementById('pd-stat-history-value');
        
        if (wlVal) wlVal.textContent = String(watchlist.length);
        if (histVal) histVal.textContent = String(history.length);
      } catch (err) {
        console.warn('Failed to fetch user passport metrics:', err);
        const wlVal = document.getElementById('pd-stat-watchlist-value');
        const histVal = document.getElementById('pd-stat-history-value');
        if (wlVal) wlVal.textContent = '0';
        if (histVal) histVal.textContent = '0';
      }
    })();

  } else {
    // ---- Guest / signed-out view ----
    dropdown.innerHTML = `
      <div class="profile-dropdown-guest-header">
        <div class="profile-dropdown-guest-title">You're browsing as guest</div>
        <div class="profile-dropdown-guest-subtitle">Sign in to sync your history and watchlist across devices.</div>
      </div>

      <button class="profile-dropdown-signin-btn" id="pd-signin-btn">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
        </svg>
        Sign in with Google
      </button>

      <div class="profile-dropdown-menu">
        <button class="profile-dropdown-item" id="pd-movies" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
          </svg>
          Browse Movies
        </button>
        <button class="profile-dropdown-item" id="pd-tv" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>
          </svg>
          Browse TV Shows
        </button>
      </div>
    `;

    dropdown.querySelector('#pd-signin-btn')?.addEventListener('click', () => {
      closeDropdown();
      showLoginPage();
    });
    dropdown.querySelector('#pd-movies')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/movies');
    });
    dropdown.querySelector('#pd-tv')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/tv');
    });
  }
}

function openDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  const avatar = document.getElementById('navbar-avatar');
  if (!dropdown || !avatar) return;
  buildDropdownContent(getUser());
  dropdown.classList.add('open');
  avatar.setAttribute('aria-expanded', 'true');
}

function closeDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  const avatar = document.getElementById('navbar-avatar');
  if (!dropdown) return;
  dropdown.classList.remove('open');
  avatar?.setAttribute('aria-expanded', 'false');
}

function toggleDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  if (!dropdown) return;
  dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
}

function showLoginPage() {
  const existing = document.getElementById('login-overlay');
  if (existing) return; // already showing

  const loginContainer = document.createElement('div');
  loginContainer.id = 'login-overlay';
  document.body.appendChild(loginContainer);

  const unsub = onUserChange((user) => {
    if (user) {
      document.getElementById('login-overlay')?.remove();
      unsub();
    }
  });

  renderLoginPage(loginContainer);
}

// ---- Update Navbar Avatar (called from auth.js) ----
export function updateNavbarAvatar(user) {
  const avatar = document.getElementById('navbar-avatar');
  if (!avatar) return;

  const inner = avatar.querySelector('.navbar-avatar-inner') || avatar;

  const welcomeName = document.getElementById('navbar-welcome-name');
  if (welcomeName) {
    welcomeName.textContent = user ? (user.displayName || user.email?.split('@')[0] || 'User') : 'Guest';
  }

  if (user) {
    if (user.photoURL) {
      inner.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName ?? 'User'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
    } else {
      inner.innerHTML = '';
      inner.textContent = user.displayName?.[0]?.toUpperCase() ?? 'U';
    }
    avatar.title = user.displayName ?? user.email ?? 'Profile';
    avatar.classList.add('signed-in');
  } else {
    inner.innerHTML = '';
    inner.textContent = 'P';
    avatar.title = 'Sign In';
    avatar.classList.remove('signed-in');
  }

  // Rebuild dropdown content if currently open
  const dropdown = document.getElementById('profile-dropdown');
  if (dropdown?.classList.contains('open')) {
    buildDropdownContent(user);
  }
}

// ---- Setup All Navbar Events ----
export function setupNavbarEvents() {
  const searchBtnMobile = document.getElementById('navbar-search-btn');
  searchBtnMobile?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.hash = '/search';
  });

  const hamburgerBtn = document.getElementById('navbar-hamburger-btn');
  hamburgerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar(true);
  });

  const searchContainer = document.getElementById('search-container');
  searchContainer?.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
      const currentPath = window.location.hash || '#/';
      if (!currentPath.includes('/search')) {
        e.preventDefault();
        e.stopPropagation();
        window.location.hash = '/search';
      }
    }
  });

  const input = document.getElementById('search-input');
  const suggestions = document.getElementById('search-suggestions');
  const clearBtn = document.getElementById('search-clear');

  if (!input) return;

  // Web Speech recognition voice search listener
  const voiceBtn = document.getElementById('search-voice');
  if (voiceBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        voiceBtn.classList.add('listening');
        input.placeholder = 'Listening... Speak now';
        
        // Dynamic feedback visual indicator
        const oldToast = document.querySelector('.voice-toast');
        if (oldToast) oldToast.remove();
        const toast = document.createElement('div');
        toast.className = 'voice-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '80px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = 'rgba(168, 85, 247, 0.9)';
        toast.style.color = 'white';
        toast.style.padding = '8px 16px';
        toast.style.borderRadius = '20px';
        toast.style.fontSize = '12px';
        toast.style.fontWeight = 'bold';
        toast.style.zIndex = '99999';
        toast.textContent = '🎙 Listening... Speak now';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      };

      recognition.onerror = (evt) => {
        console.error('Speech recognition error', evt.error);
        voiceBtn.classList.remove('listening');
        input.placeholder = 'Search movies, shows...';
        
        const oldToast = document.querySelector('.voice-toast');
        if (oldToast) oldToast.remove();
      };

      recognition.onend = () => {
        voiceBtn.classList.remove('listening');
        input.placeholder = 'Search movies, shows...';
        const oldToast = document.querySelector('.voice-toast');
        if (oldToast) oldToast.remove();
      };

      recognition.onresult = (evt) => {
        const transcript = evt.results[0][0].transcript;
        input.value = transcript;
        if (clearBtn) clearBtn.style.display = 'flex';
        addRecentSearch(transcript);
        navigate(`/search?q=${encodeURIComponent(transcript)}`);
        suggestions.style.display = 'none';
        input.blur();
      };

      voiceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          recognition.start();
        } catch (err) {
          console.warn('Recognition already started', err);
        }
      });
    } else {
      voiceBtn.style.display = 'none';
    }
  }

  // Focus empty input suggestion tags listener
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (!q) {
      renderTrendingSuggestions(suggestions, input);
    }
  });

  // Search input change/type listener
  input.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearBtn.style.display = q ? 'flex' : 'none';

    if (searchTimeout) clearTimeout(searchTimeout);
    if (!q) {
      renderTrendingSuggestions(suggestions, input);
      return;
    }
    if (q.length < 2) { suggestions.style.display = 'none'; return; }

    searchTimeout = setTimeout(async () => {
      try {
        const data = await searchMovieBox(q);
        renderSuggestions(data.results.slice(0, 6), suggestions);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q) {
        addRecentSearch(q);
        navigate(`/search?q=${encodeURIComponent(q)}`);
        suggestions.style.display = 'none';
        input.blur();
      }
    }
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    renderTrendingSuggestions(suggestions, input);
    input.focus();
  });

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-container')) {
      suggestions.style.display = 'none';
    }
  });

  // Notifications bell toggle dropdown
  document.addEventListener('click', (e) => {
    const notifBtn = e.target.closest('#navbar-notif');
    const dropdown = e.target.closest('#notif-dropdown');

    if (notifBtn) {
      e.stopPropagation();
      closeDropdown(); // close profile dropdown if open
      toggleNotifDropdown();
      return;
    }

    if (!dropdown) {
      toggleNotifDropdown(false);
    }
  });

  // Clear all notifications
  document.addEventListener('click', (e) => {
    const clearBtn = e.target.closest('#notif-clear-btn');
    if (clearBtn) {
      e.stopPropagation();
      clearAllNotifications();
    }
  });

  // Avatar → toggle dropdown
  document.addEventListener('click', (e) => {
    const avatar = e.target.closest('#navbar-avatar');
    const dropdown = e.target.closest('#profile-dropdown');

    if (avatar) {
      e.stopPropagation();
      toggleNotifDropdown(false); // close notifications dropdown if open
      toggleDropdown();
      return;
    }
    // Close if clicked outside the profile wrapper
    if (!dropdown && !e.target.closest('#profile-wrapper')) {
      closeDropdown();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
      toggleNotifDropdown(false);
    }
  });
}

function renderSuggestions(results, container) {
  if (!results.length) { container.style.display = 'none'; return; }

  container.innerHTML = results.map(item => {
    const title = item.title || item.name || 'Unknown';
    const year = (item.releaseDate || item.year || '').slice(0, 4);
    const type = item.subjectType === 2 ? 'TV' : 'Movie';
    const poster = item.cover?.url || item.poster_path || '';
    const route = item.subjectType === 2 ? `/tv/mb_${item.subjectId || item.id}` : `/movie/mb_${item.subjectId || item.id}`;

    return `
      <div class="search-suggestion-item" data-route="${route}">
        ${poster
          ? `<img class="search-suggestion-poster" src="${poster}" alt="" loading="lazy" />`
          : `<div class="search-suggestion-poster"></div>`
        }
        <div class="search-suggestion-info">
          <div class="search-suggestion-title">${title}</div>
          <div class="search-suggestion-meta">
            <span class="search-suggestion-type">${type}</span>
            ${year ? `<span>${year}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.style.display = 'block';

  container.querySelectorAll('.search-suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      navigate(el.dataset.route);
      container.style.display = 'none';
      document.getElementById('search-input').value = '';
      document.getElementById('search-clear').style.display = 'none';
    });
  });
}

// ---- Notifications Management Helpers ----

export function refreshNotifBadge() {
  const btn = document.getElementById('navbar-notif');
  if (!btn) return;

  // Clear existing badge
  const existing = btn.querySelector('.notif-badge');
  if (existing) existing.remove();

  const alerts = JSON.parse(localStorage.getItem('playeriq_notify_episodes') || '{}');
  const todayStr = new Date().toISOString().slice(0, 10);
  const unreadCount = Object.values(alerts).filter(it => it.airDate && it.airDate <= todayStr && !it.read).length;

  if (unreadCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'notif-badge';
    btn.appendChild(badge);
  }
}

export function toggleNotifDropdown(show) {
  const dropdown = document.getElementById('notif-dropdown');
  if (!dropdown) return;

  const current = dropdown.style.display !== 'none';
  const next = typeof show === 'boolean' ? show : !current;

  if (next) {
    renderNotificationsDropdown();
    dropdown.style.display = 'flex';
    
    // Mark released ones as read in localstorage
    const alerts = JSON.parse(localStorage.getItem('playeriq_notify_episodes') || '{}');
    const todayStr = new Date().toISOString().slice(0, 10);
    Object.values(alerts).forEach(it => {
      if (it.airDate && it.airDate <= todayStr) {
        it.read = true;
      }
    });
    localStorage.setItem('playeriq_notify_episodes', JSON.stringify(alerts));
    refreshNotifBadge();
  } else {
    dropdown.style.display = 'none';
  }
}

function renderNotificationsDropdown() {
  const listEl = document.getElementById('notif-dropdown-list');
  if (!listEl) return;

  const alerts = JSON.parse(localStorage.getItem('playeriq_notify_episodes') || '{}');
  const items = Object.values(alerts);
  const todayStr = new Date().toISOString().slice(0, 10);

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty-state">
        <i data-lucide="bell-off" style="width: 32px; height: 32px;"></i>
        <div class="notif-empty-state-title">No notifications yet</div>
        <div class="notif-empty-state-subtitle">We'll alert you here when subscribed episodes release!</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Sort: Released first (by airdate descending), then Upcoming (by airdate ascending)
  const released = [];
  const upcoming = [];

  items.forEach(it => {
    const isReleased = it.airDate && it.airDate <= todayStr;
    if (isReleased) released.push(it);
    else upcoming.push(it);
  });

  released.sort((a, b) => b.airDate.localeCompare(a.airDate));
  upcoming.sort((a, b) => a.airDate.localeCompare(b.airDate));

  let html = '';

  if (released.length > 0) {
    html += released.map(it => {
      const formattedDate = new Date(it.airDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const watchRoute = `#/watch/tv/${it.tvId}?s=${it.seasonNumber}&e=${it.episodeNumber}`;
      return `
        <div class="notif-item" data-route="${watchRoute}">
          <div class="notif-item-icon-wrapper">
            <i data-lucide="play" style="width: 14px; height: 14px; fill: currentColor;"></i>
          </div>
          <div class="notif-item-content">
            <div class="notif-item-title">🎉 Season ${it.seasonNumber} Episode ${it.episodeNumber} of <strong>${it.title || 'Show'}</strong> is now streaming!</div>
            <div class="notif-item-meta">
              <span>Released ${formattedDate}</span>
              <span style="color: #00a8e1; font-weight:700;">• Stream Now</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (upcoming.length > 0) {
    html += upcoming.map(it => {
      const formattedDate = it.airDate && it.airDate !== 'Soon' ? new Date(it.airDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Soon';
      const detailRoute = `#/tv/${it.tvId}`;
      return `
        <div class="notif-item upcoming" data-route="${detailRoute}">
          <div class="notif-item-icon-wrapper upcoming">
            <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
          </div>
          <div class="notif-item-content">
            <div class="notif-item-title" style="opacity: 0.7;">S${it.seasonNumber} E${it.episodeNumber} of <strong>${it.title || 'Show'}</strong> is scheduled to air.</div>
            <div class="notif-item-meta">
              <span>Airing ${formattedDate}</span>
              <span>• Alert Set</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  listEl.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();

  // Click listeners to navigate
  listEl.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const route = item.dataset.route;
      if (route) {
        window.location.hash = route;
        toggleNotifDropdown(false);
      }
    });
  });
}

export async function clearAllNotifications() {
  localStorage.setItem('playeriq_notify_episodes', '{}');
  const user = getUser();
  if (user) {
    try {
      const { collection, getDocs, deleteDoc, db } = await import('../services/firebase.js');
      const colRef = collection(db, 'users', user.uid, 'notifications');
      const snapshot = await getDocs(colRef);
      const deletions = [];
      snapshot.forEach(docSnap => deletions.push(deleteDoc(docSnap.ref)));
      await Promise.all(deletions);
    } catch (e) {
      console.warn('Failed to clear notifications in cloud:', e);
    }
  }
  refreshNotifBadge();
  renderNotificationsDropdown();
}

// ========================================
// Premium Navbar Helper Functions
// ========================================

function showToast(msg, bg = 'rgba(168, 85, 247, 0.95)') {
  document.querySelectorAll('.settings-saved-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'settings-saved-toast';
  toast.style.position = 'fixed';
  toast.style.bottom = '30px';
  toast.style.right = '30px';
  toast.style.background = bg;
  toast.style.color = '#fff';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '12px';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '700';
  toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
  toast.style.zIndex = '100005';
  toast.style.fontFamily = 'var(--font-body)';
  toast.style.animation = 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function promptNavbarPin(correctPin) {
  return new Promise((resolve) => {
    // Inject custom modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'pin-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0, 0, 0, 0.85)';
    overlay.style.backdropFilter = 'blur(12px)';
    overlay.style.webkitBackdropFilter = 'blur(12px)';
    overlay.style.zIndex = '100000';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    overlay.innerHTML = `
      <div class="pin-modal-card" style="background: rgba(18, 18, 28, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; width: 90%; max-width: 360px; padding: 30px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.6); backdrop-filter: blur(20px);">
        <div class="pin-modal-header" style="display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 15px;">
          <span style="color: var(--accent); margin-bottom: 8px;">
            <svg style="width:40px;height:40px;filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.5));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <h3 style="margin: 0; font-size: 20px; color: #fff; font-family: var(--font-display); font-weight: 800;">Parental PIN Required</h3>
        </div>
        <p style="color: var(--text-muted); font-size: 14px; line-height: 1.5; margin: 0 0 20px;">Enter your 4-digit parental PIN to decrypt the 18+ catalog bypass.</p>
        <div class="pin-input-row" style="display: flex; justify-content: center; margin-bottom: 15px;">
          <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••" id="navbar-pin-input" autocomplete="off" autofocus 
            style="background: rgba(255, 255, 255, 0.05) !important; border: 1px solid rgba(255, 255, 255, 0.15) !important; color: #fff !important; font-size: 28px !important; letter-spacing: 8px !important; text-align: center !important; padding: 10px !important; border-radius: 10px !important; width: 160px !important; outline: none !important; transition: all 0.2s !important;"/>
        </div>
        <div class="pin-error-msg" id="navbar-pin-error" style="color: #ff3366; font-size: 13px; margin-bottom: 15px; min-height: 18px; font-weight: 600;"></div>
        <div class="pin-modal-actions" style="display: flex; gap: 12px;">
          <button class="pin-btn-cancel" id="navbar-pin-cancel" style="flex: 1; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; border: none; background: rgba(255, 255, 255, 0.08); color: #fff; transition: all 0.2s;">Cancel</button>
          <button class="pin-btn-confirm" id="navbar-pin-confirm" style="flex: 1; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; border: none; background: var(--accent); color: #fff; transition: all 0.2s;">Verify</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#navbar-pin-input');
    const errorMsg = overlay.querySelector('#navbar-pin-error');
    const btnCancel = overlay.querySelector('#navbar-pin-cancel');
    const btnConfirm = overlay.querySelector('#navbar-pin-confirm');

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

      if (pinVal === correctPin) {
        close(pinVal);
      } else {
        errorMsg.textContent = 'Incorrect PIN. Access denied.';
        input.value = '';
        input.focus();
      }
    };

    btnConfirm?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  });
}

function renderTrendingSuggestions(container, input) {
  const trendingTags = [
    { label: '#Action', query: 'Action' },
    { label: '#SciFi', query: 'Sci-Fi' },
    { label: '#Trending', query: 'Trending' },
    { label: '#DrStone', query: 'Dr. Stone' },
    { label: '#Anime', query: 'Anime' },
    { label: '#FamilyHits', query: 'Family' }
  ];

  container.innerHTML = `
    <div class="search-trending-title">Trending Searches</div>
    <div class="trending-pill-container">
      ${trendingTags.map(tag => `
        <button class="trending-pill" data-query="${tag.query}">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); flex-shrink:0;">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
          ${tag.label}
        </button>
      `).join('')}
    </div>
  `;

  container.style.display = 'block';

  container.querySelectorAll('.trending-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const q = pill.dataset.query;
      input.value = q;
      const clearBtn = document.getElementById('search-clear');
      if (clearBtn) clearBtn.style.display = 'flex';
      addRecentSearch(q);
      navigate(`/search?q=${encodeURIComponent(q)}`);
      container.style.display = 'none';
      input.blur();
    });
  });
}
