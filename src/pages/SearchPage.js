// ========================================
// PlayerIQ — Search Page (MovieBox Native)
// ========================================

import { searchMovieBox } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { addRecentSearch, getState } from '../services/state.js';
import { createFooter } from '../components/Footer.js';

// Section header HTML
function sectionHeader(title, count, icon) {
  return `
    <div class="search-section-header" style="grid-column:1/-1">
      <span class="search-section-icon">${icon}</span>
      <h2 class="search-section-title">${title}</h2>
      ${count ? `<span class="search-section-count">${count} results</span>` : ''}
    </div>
  `;
}

export async function renderSearchPage({ query, container }) {
  const q = query.q || '';

  if (!q) {
    const recent = getState('recentSearches');
    container.innerHTML = `
      <div class="movie-grid-page">
        <h1 class="movie-grid-title">Search</h1>
        ${recent.length ? `
          <p style="color:var(--text-muted);margin-bottom:var(--space-md)">Recent searches</p>
          <div class="genre-pills">
            ${recent.map(r => `<button class="genre-pill" data-search="${r}">${r}</button>`).join('')}
          </div>
        ` : ''}
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div class="empty-state-title">Search for Movies &amp; TV Shows</div>
          <div class="empty-state-text">Search the entire MovieBox catalog.</div>
        </div>
      </div>
      ${createFooter()}
    `;
    container.querySelectorAll('[data-search]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = `/search?q=${encodeURIComponent(btn.dataset.search)}`;
      });
    });
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  addRecentSearch(q);

  // Show loading skeleton
  container.innerHTML = `
    <div class="movie-grid-page">
      <h1 class="movie-grid-title">Results for &ldquo;${q}&rdquo;</h1>
      <div class="movie-grid stagger-children" id="search-results">
        <div class="load-more-trigger" style="grid-column:1/-1">
          <div class="load-more-spinner"></div>
          <p style="color:var(--text-muted);margin-top:12px">Searching MovieBox…</p>
        </div>
      </div>
    </div>
  `;

  try {
    const mbResult = await searchMovieBox(q, 'all');

    const grid = document.getElementById('search-results');
    if (!grid) return;
    grid.innerHTML = '';

    const mbItems = mbResult.results || [];

    if (mbItems.length) {
      grid.innerHTML += sectionHeader('MovieBox Results', mbItems.length, '🎬');
      
      const cards = mbItems.map(m => {
        const mapped = {
          id: `mb_${m.id || m.subjectId}`,
          title: m.title,
          poster_path: m.cover?.url || m.poster_path,
          vote_average: m.imdbRate || null,
          release_date: m.releaseDate || m.year,
        };
        return createMovieCard(mapped, m.subjectType === 2 ? 'tv' : 'movie');
      }).join('');
      
      grid.innerHTML += cards;
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;margin-top:var(--space-2xl)">
          <div class="empty-state-title">No results found</div>
          <div class="empty-state-text">We couldn't find anything matching "${q}".</div>
        </div>
      `;
    }

    attachCardClicks(grid);

  } catch (err) {
    console.error('Search error:', err);
    const grid = document.getElementById('search-results');
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;margin-top:var(--space-2xl)">
          <div class="empty-state-title">Search failed</div>
          <div class="empty-state-text">Could not connect to MovieBox. Please try again later.</div>
        </div>
      `;
    }
  }

  if (window.lucide) window.lucide.createIcons();
}
