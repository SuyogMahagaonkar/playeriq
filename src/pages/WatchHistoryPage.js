// ========================================
// PlayerIQ — Watch History Page
// ========================================

import { getUser, login, onUserChange } from '../services/auth.js';
import { getWatchHistory, removeFromHistory } from '../services/auth.js';
import { navigate } from '../services/router.js';
import { createFooter } from '../components/Footer.js';

export async function renderWatchHistoryPage({ container }) {
  container.innerHTML = renderShell('loading');

  const user = getUser();

  if (!user) {
    container.innerHTML = renderGuestPrompt('Watch History', 'history');
    container.querySelector('#history-signin-btn')?.addEventListener('click', login);
    return;
  }

  try {
    let items = await getWatchHistory();
    
    // Apply SafeSearch filtering if enabled
    const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
    if (isSafe) {
      const badTitleRegex = /\b(porn|xxx|milf|erotic|erotica|brazzers|nympho|orgasm|incest|18\+|nude|nudity|naked|striptease|kamasutra|seduction|adultery|adult\s?movie|adult\s?show|hentai|fap|slut|bhabhi|bhabi|tharki|mastram|jalebi\s?bai|charmsukh|palang\s?tod|riti\s?riwaj|siskiyan|sursuri|gandii\s?baat|khuli\s?khidki|cuckold|swinger|intercourse|strip\s?club|playboy|sensual\s?desire|hot\s?scene|bedroom\s?scene|unrated\s?version|uncut\s?version|lust|ullu|kooku|nuefliks|hotshots|fliz|rabbit\s?movies|primeplay|neonx|hotmasti|fappot|glowmax|cinemadosti|chikooflix|gupchup|altbalaji|sex\s?movie|sex\s?scene|sex\s?video|sex\s?show|sex\s?tape|hardcore\s?sex|lesbian\s?sex|gay\s?sex|desi\s?hot|desi\s?sexy|desi\s?bhabhi|hot\s?web\s?series|18\+\s?web\s?series|adult\s?web\s?series|uncut\s?web\s?series|unrated\s?web\s?series|eks|seva|sexa|2x1|borders\s?of\s?love|room\s?service|higop|next\s?room\s?affair|cheaters|kuch\s?pal\s?pyar\s?ke|boss\s?ma'am|bula|vivamax|viva\s?max|selina's\s?gold|virgin\s?forest|pamasahe|lulu|siklo|kara\s?cruz|hugot|pantaxa|pabuya|isla|taya|salamat\s?daks|mama\s?katsu|sulutan|kazuko|ala\s?ala|mayank|hatsukoi\s?jikan|seika|jav)\b/i;
      items = items.filter(item => {
        const titleStr = (item.title || '').toLowerCase();
        return !titleStr.includes('xxx') && !badTitleRegex.test(titleStr);
      });
    }

    renderPage(container, items, user);
  } catch (err) {
    console.error('[WatchHistory] Error:', err);
    container.innerHTML = renderShell('error');
  }
}

function renderPage(container, items, user) {
  const count = items.length;

  container.innerHTML = `
    <div class="user-page">
      <div class="user-page-header">
        <div class="user-page-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="user-page-meta">
          <h1 class="user-page-title">Watch History</h1>
          <p class="user-page-subtitle">Everything you have watched, synced to your account</p>
        </div>
        ${count > 0 ? `
        <div class="user-page-actions">
          <button class="settings-danger-btn" id="clear-all-history-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Clear All
          </button>
        </div>` : ''}
      </div>

      <div class="user-page-body">
        ${count === 0 ? renderEmpty('history') : `
          <div class="user-page-toolbar">
            <span class="user-item-count">${count} item${count !== 1 ? 's' : ''}</span>
          </div>
          <div class="user-media-grid" id="history-grid">
            ${items.map(item => renderHistoryCard(item)).join('')}
          </div>
        `}
      </div>
    </div>
    ${createFooter()}
  `;

  // Wire "Browse" button
  container.querySelector('#browse-btn')?.addEventListener('click', () => navigate('/'));

  // Wire each card
  container.querySelectorAll('[data-history-card]').forEach(card => {
    const id = card.dataset.id;
    const type = card.dataset.mediaType;
    const season = card.dataset.season;
    const episode = card.dataset.episode;

    // Navigate on card click (excluding the remove button)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.user-media-remove')) return;
      const route = type === 'tv'
        ? `/watch/tv/${id}?s=${season}&e=${episode}`
        : `/watch/movie/${id}`;
      navigate(route);
    });

    // Remove button
    card.querySelector('.user-media-remove')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
      await removeFromHistory(id);
      card.remove();
      // Update count
      const grid = document.getElementById('history-grid');
      const remaining = grid?.querySelectorAll('[data-history-card]').length ?? 0;
      const countEl = container.querySelector('.user-item-count');
      if (countEl) countEl.textContent = `${remaining} item${remaining !== 1 ? 's' : ''}`;
      if (remaining === 0) renderPage(container, [], getUser());
    });
  });

  // Clear all history
  container.querySelector('#clear-all-history-btn')?.addEventListener('click', async () => {
    if (!confirm('Remove your entire watch history? This cannot be undone.')) return;
    const btn = container.querySelector('#clear-all-history-btn');
    btn.textContent = 'Clearing…';
    btn.disabled = true;
    await removeAllHistory(user.uid);
    renderPage(container, [], user);
  });

  if (window.lucide) window.lucide.createIcons();
}

async function removeAllHistory(uid) {
  const { clearAllWatchHistory } = await import('../services/firebase.js');
  await clearAllWatchHistory(uid);
}

function renderHistoryCard(item) {
  const progress = item.duration > 0 ? Math.round((item.currentTime / item.duration) * 100) : 0;
  const subtitle = item.type === 'tv' ? `S${item.season} · E${item.episode}` : 'Movie';
  const poster = item.poster_path || '';

  return `
    <div class="user-media-card" data-history-card data-id="${item.id}" data-media-type="${item.type}" data-season="${item.season || 1}" data-episode="${item.episode || 1}">
      ${poster
        ? `<img class="user-media-card-poster" src="${poster}" alt="${item.title}" loading="lazy" />`
        : `<div class="user-media-card-poster" style="background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;color:var(--text-dim)">No Poster</div>`
      }
      <div class="user-media-card-overlay">
        <div class="user-media-card-play">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
        </div>
      </div>
      <button class="user-media-remove" title="Remove from history">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="user-media-card-info">
        <div class="user-media-card-title" title="${item.title}">${item.title}</div>
        <div class="user-media-card-meta">
          <span class="user-media-card-type">${item.type === 'tv' ? 'TV' : 'Movie'}</span>
          <span>${subtitle}</span>
        </div>
        ${progress > 0 ? `
          <div class="user-media-progress">
            <div class="user-media-progress-fill" style="width:${Math.min(progress, 100)}%"></div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderGuestPrompt(page, icon) {
  return `
    <div class="user-page">
      <div class="user-guest-prompt">
        <div class="user-guest-prompt-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h2>Sign in to view your ${page}</h2>
        <p>Your watch history is saved to your account so you can resume watching on any device. Sign in with Google to get started.</p>
        <button class="user-guest-signin-btn" id="history-signin-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
          Sign in with Google
        </button>
      </div>
    </div>
  `;
}

function renderEmpty(type) {
  return `
    <div class="user-empty">
      <div class="user-empty-icon">📺</div>
      <div class="user-empty-title">No watch history yet</div>
      <div class="user-empty-text">Start watching movies and TV shows and they'll appear here automatically.</div>
      <button class="user-empty-btn" id="browse-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
        Browse Content
      </button>
    </div>
  `;
}

function renderShell(state) {
  if (state === 'loading') return `<div class="user-page" style="display:flex;align-items:center;justify-content:center;min-height:60vh"><div class="load-more-spinner" style="width:40px;height:40px"></div></div>`;
  return `<div class="user-page"><div class="user-empty"><div class="user-empty-title">Something went wrong</div><div class="user-empty-text">Could not load your history. Please try again.</div></div></div>`;
}
