// ========================================
// PlayerIQ — My Watchlist Page
// ========================================

import { getUser, login, waitAuthReady } from '../services/auth.js';
import { navigate } from '../services/router.js';
import { createFooter } from '../components/Footer.js';
import { fetchWatchlist, removeFromWatchlist } from '../services/firebase.js';

export async function renderWatchlistPage({ container }) {
  container.innerHTML = `<div class="user-page" style="display:flex;align-items:center;justify-content:center;min-height:60vh"><div class="load-more-spinner" style="width:40px;height:40px"></div></div>`;

  const user = await waitAuthReady();
  if (!user) {
    container.innerHTML = `
      <div class="user-page">
        <div class="user-guest-prompt">
          <div class="user-guest-prompt-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h2>Sign in to use your Watchlist</h2>
          <p>Save movies and shows you want to watch later. Your list syncs across all your devices.</p>
          <button class="user-guest-signin-btn" id="watchlist-signin-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
            Sign in with Google
          </button>
        </div>
      </div>`;
    container.querySelector('#watchlist-signin-btn')?.addEventListener('click', login);
    return;
  }

  let items = await fetchWatchlist(user.uid).catch(() => []);
  
  // Apply SafeSearch filtering if enabled
  const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
  if (isSafe) {
    const exactBlocks = ['romance', 'tl'];
    const badTitleRegex = /\b(porn|xxx|milf|erotic|erotica|brazzers|nympho|orgasm|incest|18\+|nude|nudity|naked|striptease|kamasutra|seduction|adultery|adult\s?movie|adult\s?show|hentai|fap|slut|bhabhi|bhabi|tharki|mastram|jalebi\s?bai|charmsukh|palang\s?tod|riti\s?riwaj|siskiyan|sursuri|gandii\s?baat|khuli\s?khidki|cuckold|swinger|intercourse|strip\s?club|playboy|sensual\s?desire|hot\s?scene|bedroom\s?scene|unrated\s?version|uncut\s?version|lust|ullu|kooku|nuefliks|hotshots|fliz|rabbit\s?movies|primeplay|neonx|hotmasti|fappot|glowmax|cinemadosti|chikooflix|gupchup|altbalaji|sex\s?movie|sex\s?scene|sex\s?video|sex\s?show|sex\s?tape|hardcore\s?sex|lesbian\s?sex|gay\s?sex|desi\s?hot|desi\s?sexy|desi\s?bhabhi|hot\s?web\s?series|18\+\s?web\s?series|adult\s?web\s?series|uncut\s?web\s?series|unrated\s?web\s?series|eks|seva|sexa|2x1|borders\s?of\s?love|room\s?service|higop|next\s?room\s?affair|cheaters|kuch\s?pal\s?pyar\s?ke|boss\s?ma'am|bula|vivamax|viva\s?max|selina's\s?gold|virgin\s?forest|pamasahe|lulu|siklo|kara\s?cruz|hugot|pantaxa|pabuya|isla|taya|salamat\s?daks|mama\s?katsu|sulutan|kazuko|ala\s?ala|mayank|hatsukoi\s?jikan|seika|jav|papa\s?katsu|kiss\s?&\s?kill|kiss\s?and\s?kill|99\s?moons|female\s?hostel|megane\s?no\s?megami|jalwa|tubero|big\s?and\s?black|trauma|sex\s?weather|you\s?will\s?regret\s?this|date\s?for\s?hire|pihit|city\s?girl|white\s?lily|romance\s?and\s?cegrete|romance\s?&\s?cegrete|nurse\s?abi|isapad|x-deal\s?2|sexy\s?ghotala|kaam\s?sastra|high\s?on\s?sex|teens\s?love)\b/i;
    items = items.filter(item => {
      const titleStr = (item.title || item.name || '').toLowerCase();
      if (exactBlocks.includes(titleStr)) return false;
      return !titleStr.includes('xxx') && !badTitleRegex.test(titleStr);
    });
  }

  const count = items.length;

  container.innerHTML = `
    <div class="user-page">
      <div class="user-page-header">
        <div class="user-page-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="user-page-meta">
          <h1 class="user-page-title">My Watchlist</h1>
          <p class="user-page-subtitle">Movies and shows you want to watch next</p>
        </div>
      </div>
      <div class="user-page-body">
        ${count === 0
          ? `<div class="user-empty">
               <div class="user-empty-icon">🔖</div>
               <div class="user-empty-title">Your watchlist is empty</div>
               <div class="user-empty-text">Browse content and use the bookmark button on any title to save it here.</div>
               <button class="user-empty-btn" id="browse-btn">Browse Content</button>
             </div>`
          : `<div class="user-page-toolbar"><span class="user-item-count">${count} item${count !== 1 ? 's' : ''}</span></div>
             <div class="user-media-grid" id="watchlist-grid">
               ${items.map(item => {
                 const rating = item.vote_average ? parseFloat(item.vote_average).toFixed(1) : null;
                 return `
                   <div class="user-media-card" data-watchlist-card data-id="${item.id}" data-media-type="${item.type}">
                     ${item.poster_path
                       ? `<img class="user-media-card-poster" src="${item.poster_path}" alt="${item.title}" loading="lazy"/>`
                       : `<div class="user-media-card-poster" style="background:var(--bg-tertiary)"></div>`}
                     <div class="user-media-card-overlay">
                       <div class="user-media-card-play">
                         <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
                       </div>
                     </div>
                     <button class="user-media-remove" title="Remove">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                     </button>
                     <div class="user-media-card-info">
                       <div class="user-media-card-title" title="${item.title}">${item.title}</div>
                       <div class="user-media-card-meta">
                         <span class="user-media-card-type">${item.type === 'tv' ? 'TV' : 'Movie'}</span>
                         ${rating ? `<span>⭐ ${rating}</span>` : ''}
                       </div>
                     </div>
                   </div>`;
               }).join('')}
             </div>`
        }
      </div>
    </div>
    ${createFooter()}`;

  container.querySelector('#browse-btn')?.addEventListener('click', () => navigate('/'));

  container.querySelectorAll('[data-watchlist-card]').forEach(card => {
    const id = card.dataset.id;
    const type = card.dataset.mediaType;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.user-media-remove')) return;
      navigate(`/${type}/${id}`);
    });
    card.querySelector('.user-media-remove')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
      await removeFromWatchlist(user.uid, id);
      card.remove();
    });
  });

  if (window.lucide) window.lucide.createIcons();
}
