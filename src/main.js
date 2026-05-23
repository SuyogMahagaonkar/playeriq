// ========================================
// PlayerIQ — Main Entry Point
// ========================================

// Styles
import './styles/variables.css';
import './styles/base.css';
import './styles/animations.css';
import './styles/sidebar.css';
import './styles/navbar.css';
import './styles/hero.css';
import './styles/movie-card.css';
import './styles/content-row.css';
import './styles/movie-grid.css';
import './styles/detail.css';
import './styles/player.css';
import './styles/video-player.css';
import './styles/responsive.css';
import './styles/login.css';
import './styles/profile-dropdown.css';
import './styles/user-pages.css';
import './styles/mobile-player.css';


// Core
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { PushNotifications } from '@capacitor/push-notifications';

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

    const player = document.getElementById('vp-player');
    if (player && player.classList.contains('cinematic-mode')) {
      player.classList.remove('cinematic-mode');
      const btn = document.getElementById('vp-cinematic-btn');
      if (btn) btn.classList.remove('active');
      localStorage.setItem('piq_cinematic', '0');
      return;
    }

    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // 3. Push Notifications Initialization
  PushNotifications.requestPermissions().then(result => {
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
    // Future: Handle deep links here based on notification data
  });
}

import { addRoute, initRouter } from './services/router.js';
import { createSidebar, updateSidebarActive, toggleSidebar, initSidebarToggle, refreshSidebarNav } from './components/Sidebar.js';
import { createNavbar, setupNavbarEvents, updateNavbarAvatar, refreshNotifBadge } from './components/Navbar.js';
import { initAuth, getUser, onUserChange, setNavbarAvatarUpdater, applyGlobalTheme } from './services/auth.js';
import { renderLoginPage } from './pages/LoginPage.js';

// Pages
import { renderHomePage } from './pages/HomePage.js';
import { renderMoviesPage } from './pages/MoviesPage.js';
import { renderTVShowsPage } from './pages/TVShowsPage.js';
import { renderDetailPage } from './pages/DetailPage.js';
import { renderPlayerPage } from './pages/PlayerPage.js';
import { renderSearchPage } from './pages/SearchPage.js';
import { renderRankingPage } from './pages/RankingPage.js';
import { renderWatchHistoryPage } from './pages/WatchHistoryPage.js';
import { renderWatchlistPage } from './pages/WatchlistPage.js';
import { renderSettingsPage } from './pages/SettingsPage.js';
import { render18PlusPage } from './pages/18PlusPage.js';
import { renderCategoryPage } from './pages/CategoryPage.js';
import { renderDownloadsPage } from './pages/DownloadsPage.js';

// ---- Connectivity Monitoring ----
function setupConnectivityMonitoring() {
  const updateConnectivityUI = () => {
    const isOnline = navigator.onLine;
    let banner = document.getElementById('piq-connectivity-banner');
    
    if (!isOnline) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'piq-connectivity-banner';
        banner.className = 'piq-connectivity-banner';
        banner.innerHTML = `
          <span class="banner-icon">📴</span>
          <span class="banner-text">Offline Mode — Only downloaded episodes are playable</span>
        `;
        document.body.appendChild(banner);
        // Trigger reflow then add visible
        setTimeout(() => banner.classList.add('visible'), 50);
      } else {
        banner.classList.add('visible');
      }
      showConnectivityToast('📴 Switched to Offline Mode', 'offline');
    } else {
      if (banner) {
        banner.classList.remove('visible');
        setTimeout(() => {
          if (navigator.onLine && banner.parentNode) banner.remove();
        }, 400);
      }
      showConnectivityToast('📶 Connection Restored', 'online');
    }
  };

  window.addEventListener('online', updateConnectivityUI);
  window.addEventListener('offline', updateConnectivityUI);

  // Initial check
  if (!navigator.onLine) {
    setTimeout(() => {
      let banner = document.getElementById('piq-connectivity-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'piq-connectivity-banner';
        banner.className = 'piq-connectivity-banner';
        banner.innerHTML = `
          <span class="banner-icon">📴</span>
          <span class="banner-text">Offline Mode — Only downloaded episodes are playable</span>
        `;
        document.body.appendChild(banner);
        setTimeout(() => banner.classList.add('visible'), 50);
      }
    }, 500);
  }
}

function showConnectivityToast(message, type) {
  document.querySelectorAll('.piq-connectivity-toast').forEach(t => t.remove());
  
  const toast = document.createElement('div');
  toast.className = `piq-connectivity-toast ${type}`;
  toast.innerHTML = `<span class="toast-message">${message}</span>`;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 50);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ---- Boot App ----
function initApp() {
  applyGlobalTheme();
  setupConnectivityMonitoring();
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
  bottomNav.innerHTML = `
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
      <span class="bottom-nav-text">TV Shows</span>
    </a>
    <a href="#/search" class="bottom-nav-item" data-path="/search">
      <span class="bottom-nav-icon"><i data-lucide="search"></i></span>
      <span class="bottom-nav-text">Search</span>
    </a>
    <a href="#/settings" class="bottom-nav-item" data-path="/settings">
      <span class="bottom-nav-icon"><i data-lucide="user"></i></span>
      <span class="bottom-nav-text">Profile</span>
    </a>
  `;
  app.appendChild(bottomNav);

  function updateMobileBottomNavActive() {
    const currentPath = window.location.hash.slice(1) || '/';
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      const path = item.dataset.path;
      const isActive = path === '/' 
        ? (currentPath === '/' || currentPath === '')
        : currentPath.startsWith(path);
      item.classList.toggle('active', isActive);
    });
  }

  window.addEventListener('hashchange', updateMobileBottomNavActive);
  updateMobileBottomNavActive();

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
    return await renderHomePage(ctx);
  });

  addRoute('/movies', async (ctx) => {
    updateSidebarActive();
    return await renderMoviesPage(ctx);
  });

  addRoute('/tv', async (ctx) => {
    updateSidebarActive();
    return await renderTVShowsPage(ctx);
  });

  addRoute('/movie/:id', async (ctx) => {
    updateSidebarActive();
    return await renderDetailPage(ctx);
  });

  addRoute('/tv/:id', async (ctx) => {
    updateSidebarActive();
    return await renderDetailPage(ctx);
  });

  addRoute('/watch/:type/:id', async (ctx) => {
    updateSidebarActive();
    return await renderPlayerPage(ctx);
  });

  addRoute('/search', async (ctx) => {
    updateSidebarActive();
    return await renderSearchPage(ctx);
  });

  addRoute('/ranking', async (ctx) => {
    updateSidebarActive();
    return await renderRankingPage(ctx);
  });

  addRoute('/history', async (ctx) => {
    updateSidebarActive();
    return await renderWatchHistoryPage(ctx);
  });

  addRoute('/watchlist', async (ctx) => {
    updateSidebarActive();
    return await renderWatchlistPage(ctx);
  });

  addRoute('/settings', async (ctx) => {
    updateSidebarActive();
    return await renderSettingsPage(ctx);
  });

  addRoute('/18plus', async (ctx) => {
    updateSidebarActive();
    return await render18PlusPage(ctx);
  });

  addRoute('/category', async (ctx) => {
    updateSidebarActive();
    return await renderCategoryPage(ctx);
  });

  addRoute('/downloads', async (ctx) => {
    updateSidebarActive();
    return await renderDownloadsPage(ctx);
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

        renderLoginPage(loginContainer);
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

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[PWA] Service Worker registered successfully:', reg.scope))
      .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
  });
}
