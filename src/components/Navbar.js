// ========================================
// PlayerIQ — Navbar Component
// ========================================

import { navigate } from '../services/router.js';
import { searchMovieBox } from '../services/api.js';
import { addRecentSearch } from '../services/state.js';
import { toggleSidebar } from './Sidebar.js';
import { getUser, login, logout, onUserChange } from '../services/auth.js';
import { renderLoginPage } from '../pages/LoginPage.js';

let searchTimeout = null;

export function createNavbar() {
  const navbar = document.createElement('header');
  navbar.className = 'navbar';
  navbar.id = 'navbar';

  navbar.innerHTML = `
    <div class="navbar-left">
    </div>
    <div class="navbar-right">
      <div class="search-container" id="search-container">
        <div class="search-input-wrapper">
          <i data-lucide="search"></i>
          <input type="text" class="search-input" id="search-input" placeholder="Search movies, shows..." autocomplete="off" />
          <button class="search-clear" id="search-clear" style="display:none">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="search-suggestions" id="search-suggestions" style="display:none"></div>
      </div>
      <button class="navbar-btn" id="navbar-notif" title="Notifications">
        <i data-lucide="bell"></i>
      </button>

      <!-- Profile Wrapper -->
      <div class="profile-wrapper" id="profile-wrapper">
        <div class="navbar-avatar" id="navbar-avatar" title="Profile" role="button" aria-haspopup="true" aria-expanded="false">P</div>
        <div class="profile-dropdown" id="profile-dropdown" role="menu">
          <!-- filled by JS -->
        </div>
      </div>
    </div>
  `;

  // Setup scroll listener
  setTimeout(() => setupNavbarScroll(navbar), 0);

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
        <div class="profile-dropdown-avatar">${avatarHtml}</div>
        <div class="profile-dropdown-info">
          <div class="profile-dropdown-name">${user.displayName ?? 'User'}</div>
          <div class="profile-dropdown-email">${user.email ?? ''}</div>
        </div>
        <span class="profile-dropdown-badge">Pro</span>
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
    dropdown.querySelector('#pd-history')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/history');
    });
    dropdown.querySelector('#pd-watchlist')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/watchlist');
    });
    dropdown.querySelector('#pd-settings')?.addEventListener('click', () => {
      closeDropdown();
      navigate('/settings');
    });
    dropdown.querySelector('#pd-signout')?.addEventListener('click', async () => {
      closeDropdown();
      await logout();
    });

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

  renderLoginPage(loginContainer, () => {
    document.getElementById('login-overlay')?.remove();
    unsub();
  });
}

// ---- Update Navbar Avatar (called from auth.js) ----
export function updateNavbarAvatar(user) {
  const avatar = document.getElementById('navbar-avatar');
  if (!avatar) return;

  if (user) {
    if (user.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName ?? 'User'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
    } else {
      avatar.innerHTML = '';
      avatar.textContent = user.displayName?.[0]?.toUpperCase() ?? 'U';
    }
    avatar.title = user.displayName ?? user.email ?? 'Profile';
    avatar.classList.add('signed-in');
  } else {
    avatar.innerHTML = '';
    avatar.textContent = 'P';
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
  const input = document.getElementById('search-input');
  const suggestions = document.getElementById('search-suggestions');
  const clearBtn = document.getElementById('search-clear');

  if (!input) return;

  // Search input
  input.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearBtn.style.display = q ? 'flex' : 'none';

    if (searchTimeout) clearTimeout(searchTimeout);
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
    suggestions.style.display = 'none';
    input.focus();
  });

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-container')) {
      suggestions.style.display = 'none';
    }
  });

  // Avatar → toggle dropdown
  document.addEventListener('click', (e) => {
    const avatar = e.target.closest('#navbar-avatar');
    const dropdown = e.target.closest('#profile-dropdown');

    if (avatar) {
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
    if (e.key === 'Escape') closeDropdown();
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
