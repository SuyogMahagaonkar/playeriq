// ========================================
// PlayerIQ — Main Entry Point
// ========================================

// Styles
import './styles/variables.css';
import './styles/base.css';
import './styles/animations.css';
import './styles/sidebar.css';
import './styles/navbar.css';
import './styles/responsive.css';
import './styles/profile-dropdown.css';
import './styles/user-pages.css';
import './styles/connectivity.css';


// Core
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { initConnectivity, isOnline, onConnectivityChange } from './services/connectivity.js';
// import { PushNotifications } from '@capacitor/push-notifications';

// Lock orientation to portrait globally on APK startup
if (Capacitor && Capacitor.isNativePlatform()) {
  try {
    ScreenOrientation.lock({ type: 'portrait' }).catch(() => {});
  } catch(e) {}

  // 1. App Backgrounding (Auto-pause video)
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      // App went to background -> pause video if it exists
      const video = document.getElementById('vp-video');
      if (video && !video.paused) {
        video.pause();
      }
    }
  });

  // 2. Hardware Back Button Handling
  App.addListener('backButton', ({ canGoBack }) => {
    const sidebar = document.getElementById('piq-sidebar');
    if (sidebar && sidebar.classList.contains('active')) {
      // Fast workaround to close sidebar without strict import
      sidebar.classList.remove('active');
      const overlay = document.getElementById('piq-sidebar-overlay');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
      return;
    }
    
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }



    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // 3. Push Notifications Initialization
  /* PushNotifications.requestPermissions().then(result => {
    if (result.receive === 'granted') {
      PushNotifications.register();
    }
  });
  PushNotifications.addListener('registration', (token) => {
    console.log('Push registration success, token: ' + token.value);
  });
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received: ', notification);
  });
  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('Push action performed: ', notification);
  }); */
}

import { addRoute, initRouter } from './services/router.js';
import { createSidebar, updateSidebarActive, toggleSidebar, initSidebarToggle, refreshSidebarNav } from './components/Sidebar.js';
import { createNavbar, setupNavbarEvents, updateNavbarAvatar, refreshNotifBadge } from './components/Navbar.js';
import { initAuth, getUser, onUserChange, setNavbarAvatarUpdater, applyGlobalTheme } from './services/auth.js';
import { initGlobalCastSDK } from './services/castGlobal.js';


// ---- Connectivity Monitoring (YouTube-style active probing) ----

// Create/get the floating offline card (anchored above bottom nav)
function _getOrCreateOfflineCard() {
  let card = document.getElementById('piq-offline-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'piq-offline-card';
    card.className = 'piq-offline-card';
    card.innerHTML = `
      <div class="piq-offline-card-inner">
        <!-- Wifi-off icon -->
        <div class="piq-offline-icon-wrap">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1" fill="currentColor"/>
          </svg>
        </div>

        <!-- Text -->
        <div class="piq-offline-text-wrap">
          <div class="piq-offline-title">You're offline</div>
          <div class="piq-offline-sub">Watch your downloaded videos</div>
        </div>

        <!-- Actions -->
        <div class="piq-offline-actions">
          <a class="piq-offline-dl-btn" href="#/downloads" id="piq-offline-dl-link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Downloads
          </a>
          <button class="piq-offline-dismiss" id="piq-offline-dismiss" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(card);

    // Wire dismiss button
    const dismissBtn = card.querySelector('#piq-offline-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        card.classList.remove('visible');
      });
    }
  }
  return card;
}

function _showOfflineCard() {
  document.body.classList.add('piq-is-offline');
  const card = _getOrCreateOfflineCard();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => card.classList.add('visible'));
  });
}

function _hideOfflineCard() {
  document.body.classList.remove('piq-is-offline');
  const card = document.getElementById('piq-offline-card');
  if (card) {
    card.classList.remove('visible');
    // Remove from DOM after animation
    setTimeout(() => {
      if (isOnline() && card.parentNode) card.remove();
    }, 500);
  }
}

function _showReconnectSnackbar() {
  document.querySelectorAll('.piq-reconnect-snackbar').forEach(s => s.remove());
  const snack = document.createElement('div');
  snack.className = 'piq-reconnect-snackbar';
  snack.innerHTML = `
    <span class="snackbar-icon">📶</span>
    <span>Back online!</span>
    <button class="snackbar-reload-btn" id="snack-reload">Reload</button>
  `;
  document.body.appendChild(snack);

  const reloadBtn = snack.querySelector('#snack-reload');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      snack.remove();
      const hash = window.location.hash || '#/';
      window.location.hash = '#/__reload__';
      setTimeout(() => { window.location.hash = hash; }, 50);
    });
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => snack.classList.add('show'));
  });

  setTimeout(() => {
    snack.classList.remove('show');
    setTimeout(() => snack.remove(), 400);
  }, 6000);
}

function setupConnectivityMonitoring() {
  // Initialize the active-probe service
  initConnectivity();

  // Silent initial state on boot
  if (!isOnline()) {
    setTimeout(_showOfflineCard, 700);
  }

  // React to connectivity changes
  onConnectivityChange(({ online, wasOffline }) => {
    if (!online) {
      _showOfflineCard();
    } else {
      _hideOfflineCard();
      if (wasOffline) _showReconnectSnackbar();
    }
  });
}

// ---- Boot App ----
function initApp() {
  applyGlobalTheme();
  setupConnectivityMonitoring();
  initGlobalCastSDK();
  const app = document.getElementById('app');

  // Create layout
  const sidebar = createSidebar();
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebar-overlay';
  overlay.addEventListener('click', () => toggleSidebar(false));

  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';

  const navbar = createNavbar();
  const pageContent = document.createElement('div');
  pageContent.className = 'page-content';
  pageContent.id = 'page-content';

  mainContent.appendChild(navbar);
  mainContent.appendChild(pageContent);

  app.appendChild(overlay);
  app.appendChild(sidebar);
  app.appendChild(mainContent);

  // Create Mobile Bottom Navigation (Disney+ Hotstar style)
  const bottomNav = document.createElement('nav');
  bottomNav.className = 'mobile-bottom-nav';
  bottomNav.setAttribute('id', 'mobile-bottom-nav');
  bottomNav.innerHTML = `
    <div class="nav-active-bubble" id="nav-active-bubble">
      <div class="nav-active-circle"></div>
      <svg class="nav-wave-bridge" width="90" height="20" viewBox="0 0 90 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 0,16 C 22.5,16 30,0 45,0 C 60,0 67.5,16 90,16 L 90,20 L 0,20 Z" fill="#10121e" />
      </svg>
    </div>
    <a href="#/" class="bottom-nav-item" data-path="/">
      <span class="bottom-nav-icon"><i data-lucide="home"></i></span>
      <span class="bottom-nav-text">Home</span>
    </a>
    <a href="#/movies" class="bottom-nav-item" data-path="/movies">
      <span class="bottom-nav-icon"><i data-lucide="film"></i></span>
      <span class="bottom-nav-text">Movies</span>
    </a>
    <a href="#/tv" class="bottom-nav-item" data-path="/tv">
      <span class="bottom-nav-icon"><i data-lucide="tv"></i></span>
      <span class="bottom-nav-text">TV</span>
    </a>
    <a href="#/downloads" class="bottom-nav-item bottom-nav-downloads" data-path="/downloads">
      <span class="bottom-nav-icon"><i data-lucide="download"></i></span>
      <span class="bottom-nav-text">Downloads</span>
      <span class="offline-badge"></span>
    </a>
    <a href="#/settings" class="bottom-nav-item" data-path="/settings">
      <span class="bottom-nav-icon"><i data-lucide="user"></i></span>
      <span class="bottom-nav-text">Profile</span>
    </a>
  `;
  app.appendChild(bottomNav);

  function updateMobileBottomNavActive() {
    const currentPath = window.location.hash.slice(1) || '/';
    let activeItem = null;
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      const path = item.dataset.path;
      const isActive = path === '/' 
        ? (currentPath === '/' || currentPath === '')
        : currentPath.startsWith(path);
      item.classList.toggle('active', isActive);
      if (isActive) {
        activeItem = item;
      }
    });

    // Translate the liquid active bubble dynamically to center over the active item!
    const bubble = document.getElementById('nav-active-bubble');
    if (bubble) {
      if (activeItem) {
        bubble.style.display = 'block';
        const itemWidth = activeItem.offsetWidth;
        const itemLeft = activeItem.offsetLeft;
        const bubbleWidth = 90; // Centered 90px container including the wave bridge
        const shiftX = itemLeft + (itemWidth - bubbleWidth) / 2;
        bubble.style.transform = `translate3d(${shiftX}px, 0, 0)`;
      } else {
        bubble.style.display = 'none';
      }
    }
  }

  window.addEventListener('hashchange', () => {
    updateMobileBottomNavActive();
    if (window._syncFloatingCastCardVisibility) window._syncFloatingCastCardVisibility();
  });
  window.addEventListener('resize', () => {
    updateMobileBottomNavActive();
  });
  
  // Schedule a small delay to align bubble precisely after DOM elements fully compute layouts
  setTimeout(updateMobileBottomNavActive, 100);
  updateMobileBottomNavActive();
  if (window._syncFloatingCastCardVisibility) window._syncFloatingCastCardVisibility();

  // Setup navbar events
  setupNavbarEvents();

  // Initialize Lucide icons for sidebar, navbar, and bottom nav
  if (window.lucide) window.lucide.createIcons();

  // Wire navbar avatar updater into auth service (avoids circular imports)
  setNavbarAvatarUpdater(updateNavbarAvatar);

  // Bootstrap Firebase auth listener
  initAuth();
  onUserChange(() => {
    refreshSidebarNav();
  });

  // Boot collapsible sidebar toggle
  initSidebarToggle();

  // ---- Check and Trigger Local Push Notifications ----
  setTimeout(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const alerts = JSON.parse(localStorage.getItem('playeriq_notify_episodes') || '{}');
      const todayStr = new Date().toISOString().slice(0, 10);
      let updated = false;

      Object.values(alerts).forEach(notif => {
        const isReleased = notif.airDate && notif.airDate <= todayStr;
        if (isReleased && !notif.delivered) {
          try {
            new Notification(`New Episode Out! 🍿`, {
              body: `Season ${notif.seasonNumber} Episode ${notif.episodeNumber} of "${notif.title || 'Show'}" is now streaming!`,
              icon: '/favicon.ico'
            });
            notif.delivered = true;
            updated = true;
          } catch (e) {
            console.warn('Failed to fire browser push alert:', e);
          }
        }
      });

      if (updated) {
        localStorage.setItem('playeriq_notify_episodes', JSON.stringify(alerts));
        refreshNotifBadge();
      }
    }
  }, 3000);

  // ---- Register Routes ----
  addRoute('/', async (ctx) => {
    updateSidebarActive();
    const { renderHomePage } = await import('./pages/HomePage.js');
    return await renderHomePage(ctx);
  });

  addRoute('/movies', async (ctx) => {
    updateSidebarActive();
    const { renderMoviesPage } = await import('./pages/MoviesPage.js');
    return await renderMoviesPage(ctx);
  });

  addRoute('/tv', async (ctx) => {
    updateSidebarActive();
    const { renderTVShowsPage } = await import('./pages/TVShowsPage.js');
    return await renderTVShowsPage(ctx);
  });

  addRoute('/movie/:id', async (ctx) => {
    updateSidebarActive();
    const { renderDetailPage } = await import('./pages/DetailPage.js');
    return await renderDetailPage(ctx);
  });

  addRoute('/tv/:id', async (ctx) => {
    updateSidebarActive();
    const { renderDetailPage } = await import('./pages/DetailPage.js');
    return await renderDetailPage(ctx);
  });

  addRoute('/watch/:type/:id', async (ctx) => {
    updateSidebarActive();
    const { renderPlayerPage } = await import('./pages/PlayerPage.js');
    return await renderPlayerPage(ctx);
  });

  addRoute('/search', async (ctx) => {
    updateSidebarActive();
    const { renderSearchPage } = await import('./pages/SearchPage.js');
    return await renderSearchPage(ctx);
  });

  addRoute('/ranking', async (ctx) => {
    updateSidebarActive();
    const { renderRankingPage } = await import('./pages/RankingPage.js');
    return await renderRankingPage(ctx);
  });

  addRoute('/studios', async (ctx) => {
    updateSidebarActive();
    const { renderStudiosPage } = await import('./pages/StudiosPage.js');
    return await renderStudiosPage(ctx);
  });

  addRoute('/history', async (ctx) => {
    updateSidebarActive();
    const { renderWatchHistoryPage } = await import('./pages/WatchHistoryPage.js');
    return await renderWatchHistoryPage(ctx);
  });

  addRoute('/watchlist', async (ctx) => {
    updateSidebarActive();
    const { renderWatchlistPage } = await import('./pages/WatchlistPage.js');
    return await renderWatchlistPage(ctx);
  });

  addRoute('/settings', async (ctx) => {
    updateSidebarActive();
    const { renderSettingsPage } = await import('./pages/SettingsPage.js');
    return await renderSettingsPage(ctx);
  });

  addRoute('/18plus', async (ctx) => {
    updateSidebarActive();
    const { render18PlusPage } = await import('./pages/18PlusPage.js');
    return await render18PlusPage(ctx);
  });

  addRoute('/category', async (ctx) => {
    updateSidebarActive();
    const { renderCategoryPage } = await import('./pages/CategoryPage.js');
    return await renderCategoryPage(ctx);
  });

  addRoute('/downloads', async (ctx) => {
    updateSidebarActive();
    const { renderDownloadsPage } = await import('./pages/DownloadsPage.js');
    return await renderDownloadsPage(ctx);
  });

  addRoute('/calendar', async (ctx) => {
    updateSidebarActive();
    const { renderCalendarPage } = await import('./pages/CalendarPage.js');
    return await renderCalendarPage(ctx);
  });

  // Start routing
  initRouter();

  // Hide splash screen, then show login if not signed in
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.add('hidden');
    
    if (Capacitor && Capacitor.isNativePlatform()) {
      try { SplashScreen.hide(); } catch(e) {}
    }

    setTimeout(() => {
      splash?.remove();

      // Show login page only if user is not signed in
      if (!getUser()) {
        const loginContainer = document.createElement('div');
        loginContainer.id = 'login-overlay';
        document.body.appendChild(loginContainer);

        // Unsubscribe once user signs in via the page itself
        const unsub = onUserChange((user) => {
          if (user) {
            const overlay = document.getElementById('login-overlay');
            if (overlay) overlay.remove();
            unsub();
          }
        });

        import('./pages/LoginPage.js').then(({ renderLoginPage }) => {
          renderLoginPage(loginContainer);
        });
      }
    }, 600);
  }, 800);
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Mobile parallax background shift on scroll
window.addEventListener('scroll', () => {
  if (window.innerWidth <= 768) {
    document.body.style.backgroundPositionY = `${window.scrollY * 0.15}px`;
  }
}, { passive: true });

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[PWA] Service Worker registered successfully:', reg.scope))
      .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
  });
}
