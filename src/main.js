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

// Core
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

// ---- Boot App ----
function initApp() {
  applyGlobalTheme();
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

  // Setup navbar events
  setupNavbarEvents();

  // Initialize Lucide icons for sidebar and navbar
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

  // Start routing
  initRouter();

  // Hide splash screen, then show login if not signed in
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.add('hidden');
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
