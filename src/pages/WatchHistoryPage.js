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
      const exactBlocks = ['romance', 'tl'];
      const badTitleRegex = /\b(porn|xxx|milf|erotic|erotica|brazzers|nympho|orgasm|incest|18\+|nude|nudity|naked|striptease|kamasutra|seduction|adultery|adult\s?movie|adult\s?show|hentai|fap|slut|bhabhi|bhabi|tharki|mastram|jalebi\s?bai|charmsukh|palang\s?tod|riti\s?riwaj|siskiyan|sursuri|gandii\s?baat|khuli\s?khidki|cuckold|swinger|intercourse|strip\s?club|playboy|sensual\s?desire|hot\s?scene|bedroom\s?scene|unrated\s?version|uncut\s?version|lust|ullu|kooku|nuefliks|hotshots|fliz|rabbit\s?movies|primeplay|neonx|hotmasti|fappot|glowmax|cinemadosti|chikooflix|gupchup|altbalaji|sex\s?movie|sex\s?scene|sex\s?video|sex\s?show|sex\s?tape|hardcore\s?sex|lesbian\s?sex|gay\s?sex|desi\s?hot|desi\s?sexy|desi\s?bhabhi|hot\s?web\s?series|18\+\s?web\s?series|adult\s?web\s?series|uncut\s?web\s?series|unrated\s?web\s?series|eks|seva|sexa|2x1|borders\s?of\s?love|room\s?service|higop|next\s?room\s?affair|cheaters|kuch\s?pal\s?pyar\s?ke|boss\s?ma'am|bula|vivamax|viva\s?max|selina's\s?gold|virgin\s?forest|pamasahe|lulu|siklo|kara\s?cruz|hugot|pantaxa|pabuya|isla|taya|salamat\s?daks|mama\s?katsu|sulutan|kazuko|ala\s?ala|mayank|hatsukoi\s?jikan|seika|jav|papa\s?katsu|kiss\s?&\s?kill|kiss\s?and\s?kill|99\s?moons|female\s?hostel|megane\s?no\s?megami|jalwa|tubero|big\s?and\s?black|trauma|sex\s?weather|you\s?will\s?regret\s?this|date\s?for\s?hire|pihit|city\s?girl|white\s?lily|romance\s?and\s?cegrete|romance\s?&\s?cegrete|nurse\s?abi|isapad|x-deal\s?2|sexy\s?ghotala|kaam\s?sastra|high\s?on\s?sex|teens\s?love)\b/i;
      items = items.filter(item => {
        const titleStr = (item.title || '').toLowerCase();
        if (exactBlocks.includes(titleStr)) return false;
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

  const completedItems = items.filter(item => {
    return item.watched || (item.duration > 0 && (item.duration - item.currentTime <= 300));
  });

  const inProgressItems = items.filter(item => {
    return !item.watched && !(item.duration > 0 && (item.duration - item.currentTime <= 300));
  });

  // Group completed TV shows together if there are multiple episodes
  const completedGroups = [];
  const tvGroups = {};

  completedItems.forEach(item => {
    if (item.type === 'tv') {
      if (!tvGroups[item.id]) {
        tvGroups[item.id] = [];
      }
      tvGroups[item.id].push(item);
    } else {
      completedGroups.push({
        type: 'movie',
        item: item
      });
    }
  });

  Object.keys(tvGroups).forEach(tvId => {
    const eps = tvGroups[tvId];
    if (eps.length === 1) {
      completedGroups.push({
        type: 'single-tv',
        item: eps[0]
      });
    } else {
      eps.sort((a, b) => {
        if (Number(a.season) !== Number(b.season)) {
          return Number(a.season) - Number(b.season);
        }
        return Number(a.episode) - Number(b.episode);
      });
      completedGroups.push({
        type: 'folder-tv',
        id: tvId,
        title: eps[0].title || eps[0].name,
        poster_path: eps[0].poster_path,
        episodes: eps
      });
    }
  });

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
            <button class="settings-danger-btn" id="delete-selected-btn" style="display: none; margin-left: auto;" title="Delete Selected">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              (<span id="delete-selected-count">0</span>)
            </button>
          </div>
          
          ${inProgressItems.length > 0 ? `
            <h2 class="history-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 18px; height: 18px; color: var(--accent);"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Recently Watched
            </h2>
            <div class="user-media-grid" style="margin-bottom: var(--space-2xl);">
              ${inProgressItems.map(item => renderHistoryCard(item, false)).join('')}
            </div>
          ` : ''}

          ${completedItems.length > 0 ? `
            <h2 class="history-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 18px; height: 18px; color: #22c55e;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              Watch Again
            </h2>
            <div class="user-media-grid">
              ${completedGroups.map(group => {
                if (group.type === 'folder-tv') {
                  return renderFolderCard(group);
                } else {
                  return renderHistoryCard(group.item, true);
                }
              }).join('')}
            </div>
          ` : ''}
        `}
      </div>
    </div>
    ${createFooter()}
  `;

  // Wire "Browse" button
  container.querySelector('#browse-btn')?.addEventListener('click', () => navigate('/'));

  // Wire standard cards
  container.querySelectorAll('[data-history-card]').forEach(card => {
    const id = card.dataset.id;
    const type = card.dataset.mediaType;
    const season = card.dataset.season;
    const episode = card.dataset.episode;

    // Navigate on card click (excluding check box or remove button)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.user-media-remove') || e.target.closest('.user-media-checkbox')) return;
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
      const remaining = container.querySelectorAll('[data-history-card], [data-history-folder]').length;
      const countEl = container.querySelector('.user-item-count');
      if (countEl) countEl.textContent = `${remaining} item${remaining !== 1 ? 's' : ''}`;
      if (remaining === 0) renderPage(container, [], getUser());
      updateDeleteSelectedButton();
    });
  });

  // Wire folder cards
  container.querySelectorAll('[data-history-folder]').forEach(folder => {
    folder.addEventListener('click', (e) => {
      if (e.target.closest('.user-media-remove') || e.target.closest('.user-media-checkbox')) return;
      const title = folder.dataset.title;
      const episodes = JSON.parse(folder.dataset.episodesJson);
      openFolderModal(title, episodes);
    });

    // Remove entire collection button
    folder.querySelector('.user-media-remove')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove all watched episodes of "${folder.dataset.title}" from history?`)) return;
      folder.style.opacity = '0.4';
      folder.style.pointerEvents = 'none';

      const episodes = JSON.parse(folder.dataset.episodesJson);
      for (const ep of episodes) {
        // Also clear out individual records
        await removeFromHistory(ep.id);
      }

      folder.remove();
      // Update count
      const remaining = container.querySelectorAll('[data-history-card], [data-history-folder]').length;
      const countEl = container.querySelector('.user-item-count');
      if (countEl) countEl.textContent = `${remaining} item${remaining !== 1 ? 's' : ''}`;
      if (remaining === 0) renderPage(container, [], getUser());
      updateDeleteSelectedButton();
    });
  });

  // Wire checkbox events
  const updateDeleteSelectedButton = () => {
    const checked = container.querySelectorAll('.bulk-delete-checkbox:checked');
    const count = checked.length;
    const btn = container.querySelector('#delete-selected-btn');
    const countEl = container.querySelector('#delete-selected-count');

    if (count > 0) {
      if (btn) btn.style.display = 'inline-flex';
      if (countEl) countEl.textContent = count;
    } else {
      if (btn) btn.style.display = 'none';
    }
  };

  container.querySelectorAll('.bulk-delete-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const wrapper = cb.closest('.user-media-checkbox');
      if (wrapper) {
        wrapper.classList.toggle('checked-active', cb.checked);
      }
      updateDeleteSelectedButton();
    });

    cb.closest('.user-media-checkbox')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  // Wire Bulk Delete button click
  container.querySelector('#delete-selected-btn')?.addEventListener('click', async () => {
    const checked = container.querySelectorAll('.bulk-delete-checkbox:checked');
    if (checked.length === 0) return;

    if (!confirm(`Delete all ${checked.length} selected collections/items from watch history?`)) return;

    const btn = container.querySelector('#delete-selected-btn');
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;animation:spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg>`;
    btn.disabled = true;

    for (const cb of checked) {
      const id = cb.dataset.id;
      const epsJson = cb.dataset.episodesJson;

      if (epsJson) {
        const episodes = JSON.parse(epsJson);
        for (const ep of episodes) {
          await removeFromHistory(ep.id);
        }
      } else {
        await removeFromHistory(id);
      }
    }

    // Refresh page
    let freshItems = await getWatchHistory();
    const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
    if (isSafe) {
      const exactBlocks = ['romance', 'tl'];
      const badTitleRegex = /\b(porn|xxx|milf|erotic|erotica|brazzers|nympho|orgasm|incest|18\+|nude|nudity|naked|striptease|kamasutra|seduction|adultery|adult\s?movie|adult\s?show|hentai|fap|slut|bhabhi|bhabi|tharki|mastram|jalebi\s?bai|charmsukh|palang\s?tod|riti\s?riwaj|siskiyan|sursuri|gandii\s?baat|khuli\s?khidki|cuckold|swinger|intercourse|strip\s?club|playboy|sensual\s?desire|hot\s?scene|bedroom\s?scene|unrated\s?version|uncut\s?version|lust|ullu|kooku|nuefliks|hotshots|fliz|rabbit\s?movies|primeplay|neonx|hotmasti|fappot|glowmax|cinemadosti|chikooflix|gupchup|altbalaji|sex\s?movie|sex\s?scene|sex\s?video|sex\s?show|sex\s?tape|hardcore\s?sex|lesbian\s?sex|gay\s?sex|desi\s?hot|desi\s?sexy|desi\s?bhabhi|hot\s?web\s?series|18\+\s?web\s?series|adult\s?web\s?series|uncut\s?web\s?series|unrated\s?web\s?series|eks|seva|sexa|2x1|borders\s?of\s?love|room\s?service|higop|next\s?room\s?affair|cheaters|kuch\s?pal\s?pyar\s?ke|boss\s?ma'am|bula|vivamax|viva\s?max|selina's\s?gold|virgin\s?forest|pamasahe|lulu|siklo|kara\s?cruz|hugot|pantaxa|pabuya|isla|taya|salamat\s?daks|mama\s?katsu|sulutan|kazuko|ala\s?ala|mayank|hatsukoi\s?jikan|seika|jav|papa\s?katsu|kiss\s?&\s?kill|kiss\s?and\s?kill|99\s?moons|female\s?hostel|megane\s?no\s?megami|jalwa|tubero|big\s?and\s?black|trauma|sex\s?weather|you\s?will\s?regret\s?this|date\s?for\s?hire|pihit|city\s?girl|white\s?lily|romance\s?and\s?cegrete|romance\s?&\s?cegrete|nurse\s?abi|isapad|x-deal\s?2|sexy\s?ghotala|kaam\s?sastra|high\s?on\s?sex|teens\s?love)\b/i;
      freshItems = freshItems.filter(item => {
        const titleStr = (item.title || '').toLowerCase();
        if (exactBlocks.includes(titleStr)) return false;
        return !titleStr.includes('xxx') && !badTitleRegex.test(titleStr);
      });
    }
    renderPage(container, freshItems, user);
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

function renderHistoryCard(item, isWatchAgain = false) {
  const progress = item.duration > 0 ? Math.round((item.currentTime / item.duration) * 100) : 0;
  const subtitle = item.type === 'tv' ? `S${item.season} · E${item.episode}` : 'Movie';
  const poster = item.poster_path || '';

  return `
    <div class="user-media-card" data-history-card data-id="${item.id}" data-media-type="${item.type}" data-season="${item.season || 1}" data-episode="${item.episode || 1}">
      <div class="user-media-checkbox" title="Select for bulk delete">
        <input type="checkbox" class="bulk-delete-checkbox" data-id="${item.id}" />
        <div class="checkbox-visual"></div>
      </div>
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
        ${!isWatchAgain && progress > 0 ? `
          <div class="user-media-progress">
            <div class="user-media-progress-fill" style="width:${Math.min(progress, 100)}%"></div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderFolderCard(group) {
  const poster = group.poster_path || '';
  const count = group.episodes.length;

  return `
    <div class="user-media-card folder-card" data-history-folder data-id="${group.id}" data-episodes-json='${JSON.stringify(group.episodes).replace(/'/g, "&apos;")}' data-title="${group.title}">
      <div class="user-media-checkbox" title="Select entire collection for bulk delete">
        <input type="checkbox" class="bulk-delete-checkbox" data-id="${group.id}" data-episodes-json='${JSON.stringify(group.episodes).replace(/'/g, "&apos;")}' />
        <div class="checkbox-visual"></div>
      </div>
      <div class="folder-stack-layer folder-stack-layer-1"></div>
      <div class="folder-stack-layer folder-stack-layer-2"></div>
      
      <div class="folder-poster-wrapper">
        ${poster
          ? `<img class="user-media-card-poster" src="${poster}" alt="${group.title}" loading="lazy" />`
          : `<div class="user-media-card-poster" style="background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;color:var(--text-dim)">No Poster</div>`
        }
        <div class="user-media-card-overlay">
          <div class="user-media-card-play">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
          </div>
        </div>
      </div>
      <button class="user-media-remove" title="Remove entire show from history">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="user-media-card-info">
        <div class="user-media-card-title" title="${group.title}">${group.title}</div>
        <div class="user-media-card-meta">
          <span class="user-media-card-type folder-badge">Collection</span>
          <span class="folder-episode-count">${count} Episodes</span>
        </div>
      </div>
    </div>
  `;
}

function openFolderModal(title, episodes) {
  const overlay = document.createElement('div');
  overlay.className = 'folder-modal-overlay';
  overlay.innerHTML = `
    <div class="folder-modal">
      <div class="folder-modal-header">
        <div class="folder-modal-title-wrapper">
          <span class="folder-modal-badge"><i data-lucide="layers"></i> Collection</span>
          <h2 class="folder-modal-title">${title}</h2>
        </div>
        <button class="folder-modal-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="folder-modal-body">
        <p class="folder-modal-desc">You have completed ${episodes.length} episodes of this show. Select an episode to watch it again:</p>
        <div class="folder-episodes-grid">
          ${episodes.map(ep => {
            const epTitle = ep.title || `Episode ${ep.episode}`;
            const subtitle = `Season ${ep.season} · Episode ${ep.episode}`;
            return `
              <div class="folder-episode-item" data-route="/watch/tv/${ep.id}?s=${ep.season}&e=${ep.episode}">
                <div class="folder-episode-poster">
                  ${ep.poster_path 
                    ? `<img src="${ep.poster_path}" alt="${epTitle}" loading="lazy" />` 
                    : `<div class="folder-no-poster">No Poster</div>`
                  }
                  <div class="folder-episode-play">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
                  </div>
                </div>
                <div class="folder-episode-info">
                  <div class="folder-episode-code">${subtitle}</div>
                  <div class="folder-episode-name" title="${epTitle}">${epTitle}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 250);
  };
  overlay.querySelector('.folder-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelectorAll('.folder-episode-item').forEach(item => {
    item.addEventListener('click', () => {
      close();
      const route = item.dataset.route;
      import('../services/router.js').then(({ navigate }) => navigate(route));
    });
  });

  if (window.lucide) window.lucide.createIcons();
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
