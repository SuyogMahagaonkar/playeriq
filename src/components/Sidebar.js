// ========================================
// PlayerIQ — Sidebar Component (Collapsible)
// ========================================

import { getCurrentPath } from '../services/router.js';

const NAV_ITEMS = [
  { label: 'Home',        icon: 'home',      path: '/' },
  { label: 'Movies',      icon: 'film',      path: '/movies' },
  { label: 'TV Shows',    icon: 'tv',        path: '/tv' },
  { label: 'Animation',   icon: 'sparkles',  path: '/movies?genre=16' },
  { label: 'Most Watched',icon: 'trophy',    path: '/ranking' },
];

const SECONDARY_ITEMS = [
  { label: 'Search', icon: 'search', path: '/search' },
];

// Hamburger SVG icon (three lines, animated)
const hamburgerIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <line x1="3" y1="6"  x2="21" y2="6"  stroke-linecap="round"/>
    <line x1="3" y1="12" x2="21" y2="12" stroke-linecap="round"/>
    <line x1="3" y1="18" x2="21" y2="18" stroke-linecap="round"/>
  </svg>
`;

export function createSidebar() {
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';

  sidebar.innerHTML = `
    <div class="sidebar-logo-row">
      <a href="#/" class="sidebar-logo" id="sidebar-logo">
        <span class="sidebar-logo-icon">▶</span>
        <span class="sidebar-logo-text">Player<span class="sidebar-logo-accent">IQ</span></span>
      </a>
      <button class="sidebar-hamburger" id="sidebar-toggle" aria-label="Toggle sidebar" title="Toggle Sidebar">
        ${hamburgerIcon}
      </button>
    </div>
    <nav class="sidebar-nav"></nav>
    <div class="sidebar-footer">
      <div class="sidebar-footer-text">© 2025 PlayerIQ</div>
    </div>
  `;

  // Populate nav items in next tick once elements are loaded
  setTimeout(() => {
    refreshSidebarNav();
  }, 0);

  return sidebar;
}

export function refreshSidebarNav() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
  const navItems = [...NAV_ITEMS];
  if (!isSafe) {
    // Insert 18+ right after TV Shows
    navItems.splice(3, 0, { label: '18+ Catalog', icon: 'flame', path: '/18plus' });
  }

  nav.innerHTML = `
    <div class="sidebar-section-label">Menu</div>
    ${navItems.map(item => `
      <a href="#${item.path}" class="sidebar-link" data-path="${item.path}" data-label="${item.label}">
        <span class="sidebar-link-icon"><i data-lucide="${item.icon}"></i></span>
        <span class="sidebar-link-text">${item.label}</span>
      </a>
    `).join('')}
    <div class="sidebar-section-label">Library</div>
    ${SECONDARY_ITEMS.map(item => `
      <a href="#${item.path}" class="sidebar-link" data-path="${item.path}" data-label="${item.label}">
        <span class="sidebar-link-icon"><i data-lucide="${item.icon}"></i></span>
        <span class="sidebar-link-text">${item.label}</span>
      </a>
    `).join('')}
  `;

  if (window.lucide) window.lucide.createIcons();
  updateSidebarActive();
}

export function initSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar   = document.getElementById('sidebar');
  if (!toggleBtn || !sidebar) return;

  // Restore from localStorage
  const savedState = localStorage.getItem('piq_sidebar_collapsed');
  if (savedState === 'true') {
    sidebar.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
  }

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('piq_sidebar_collapsed', isCollapsed);
    // Re-render Lucide icons in case any changed
    if (window.lucide) window.lucide.createIcons();
  });
}

export function updateSidebarActive() {
  const currentPath = getCurrentPath();
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const path = link.dataset.path;
    const isActive = currentPath === path ||
      (path !== '/' && currentPath.startsWith(path));
    link.classList.toggle('active', isActive);
  });
}

export function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open', open);
  if (overlay) overlay.classList.toggle('active', open);
}
