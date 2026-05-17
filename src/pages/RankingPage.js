// ========================================
// PlayerIQ — Ranking Page (MovieBox Native)
// ========================================

import { searchMovieBox } from '../services/api.js';
import { navigate } from '../services/router.js';
import { createFooter } from '../components/Footer.js';

export async function renderRankingPage({ container }) {
  container.innerHTML = `
    <div class="movie-grid-page">
      <h1 class="movie-grid-title">🏆 Top Trending</h1>
      <div class="genre-pills" id="ranking-tabs">
        <button class="genre-pill active" data-tab="1">Movies</button>
        <button class="genre-pill" data-tab="2">TV Shows</button>
      </div>
      <div id="ranking-list" style="display:flex;flex-direction:column;gap:var(--space-sm)">
        <div class="load-more-trigger"><div class="load-more-spinner"></div></div>
      </div>
    </div>
    ${createFooter()}
  `;

  let currentTab = '1';

  async function loadRanking(type) {
    const listEl = document.getElementById('ranking-list');
    listEl.innerHTML = '<div class="load-more-trigger"><div class="load-more-spinner"></div></div>';

    try {
      // Use a broad search to pull top results
      const data = await searchMovieBox('2024', type);
      const items = (data.results || []).slice(0, 20);

      listEl.innerHTML = items.map((item, i) => {
        const title = item.title || item.name;
        const year = (item.releaseDate || item.year || '').slice(0, 4);
        const rating = item.imdbRate ? parseFloat(item.imdbRate).toFixed(1) : '—';
        const poster = item.cover?.url || item.poster_path || '';
        const route = type === '2' ? `/tv/mb_${item.subjectId || item.id}` : `/movie/mb_${item.subjectId || item.id}`;

        return `
          <div class="episode-card" data-route="${route}" style="cursor:pointer">
            <div style="display:flex;align-items:center;justify-content:center;min-width:50px;font-family:var(--font-display);font-size:var(--text-3xl);font-weight:var(--weight-extrabold);color:${i < 3 ? 'var(--accent)' : 'var(--text-dim)'}">${i + 1}</div>
            ${poster
              ? `<img class="episode-still" src="${poster}" alt="${title}" style="width:70px;min-width:70px;aspect-ratio:2/3;border-radius:var(--radius-sm)" loading="lazy" />`
              : `<div class="episode-still" style="width:70px;min-width:70px;aspect-ratio:2/3;border-radius:var(--radius-sm);background:var(--bg-tertiary)"></div>`
            }
            <div class="episode-info" style="display:flex;flex-direction:column;justify-content:center">
              <div class="episode-name" style="font-size:var(--text-md)">${title}</div>
              <div class="episode-number" style="display:flex;align-items:center;gap:var(--space-xs)">
                <span>⭐ ${rating}</span>
                <span>•</span>
                <span>${year}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('[data-route]').forEach(card => {
        card.addEventListener('click', () => navigate(card.dataset.route));
      });

    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p style="color:var(--text-muted);padding:var(--space-xl)">Failed to load rankings.</p>';
    }
  }

  await loadRanking('1');

  document.querySelectorAll('#ranking-tabs .genre-pill').forEach(tab => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('#ranking-tabs .genre-pill').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      await loadRanking(currentTab);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}
