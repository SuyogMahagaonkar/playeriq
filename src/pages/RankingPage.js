// ========================================
// PlayerIQ — Ranking Page (Cinematic Charts)
// ========================================

import { getTrendingMovies, getTrendingTV, getMediaImages, img } from '../services/api.js';
import { navigate } from '../services/router.js';
import { createFooter } from '../components/Footer.js';

export async function renderRankingPage({ container }) {
  container.innerHTML = `
    <div class="movie-grid-page">
      <h1 class="movie-grid-title" style="margin-bottom: var(--space-md)">🏆 Trending Charts</h1>
      
      <div class="ranking-tabs-container">
        <div class="ranking-tabs" id="ranking-tabs">
          <button class="ranking-tab active" data-tab="movie">Movies</button>
          <button class="ranking-tab" data-tab="tv">TV Shows</button>
        </div>
      </div>
      
      <div id="ranking-list-container">
        <div class="load-more-trigger"><div class="load-more-spinner"></div></div>
      </div>
    </div>
    ${createFooter()}
  `;

  let currentTab = 'movie';

  async function loadRanking(type) {
    const listContainer = document.getElementById('ranking-list-container');
    listContainer.innerHTML = '<div class="load-more-trigger"><div class="load-more-spinner"></div></div>';

    try {
      // 1. Fetch official TMDB weekly trending data
      const data = type === 'movie' ? await getTrendingMovies(1) : await getTrendingTV(1);
      const rawItems = (data.results || []).slice(0, 20);

      if (!rawItems.length) {
        listContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:var(--space-xl)">No trending items found.</p>';
        return;
      }

      // 2. Separate Rank #1 (Spotlight) and Ranks #2-20 (Grid)
      const spotlightItem = rawItems[0];
      const itemsForGrid = rawItems.slice(1);
      
      const spotlightType = type;
      const spotlightTitle = spotlightItem.title || spotlightItem.name;

      // Parallelize official transparent PNG logo fetching
      const imagesData = await getMediaImages(spotlightItem.id, spotlightType, spotlightTitle).catch(() => null);
      
      let logoHTML = `<h1 class="spotlight-title">${spotlightTitle}</h1>`;
      if (imagesData && imagesData.logos && imagesData.logos.length > 0) {
        const enLogo = imagesData.logos.find(l => l.iso_639_1 === 'en');
        const hiLogo = imagesData.logos.find(l => l.iso_639_1 === 'hi');
        const bestLogo = enLogo || hiLogo || imagesData.logos[0];
        if (bestLogo) {
          logoHTML = `
            <div class="spotlight-logo-container">
              <img class="spotlight-logo-img" src="https://image.tmdb.org/t/p/w500${bestLogo.file_path}" alt="${spotlightTitle} Logo" />
            </div>
          `;
        }
      }

      const rating = spotlightItem.vote_average ? spotlightItem.vote_average.toFixed(1) : '—';
      const year = (spotlightItem.release_date || spotlightItem.first_air_date || '').slice(0, 4);
      const overview = spotlightItem.overview || 'Explore details and start streaming now.';
      const spotlightRoute = `/${spotlightType}/${spotlightItem.id}`;
      const playRoute = `/watch/${spotlightType}/${spotlightItem.id}`;

      // Spotlight Hero HTML (Rank #1)
      const spotlightHTML = `
        <div class="ranking-spotlight" data-route="${spotlightRoute}">
          <img class="spotlight-backdrop" src="${img.backdrop(spotlightItem.backdrop_path)}" alt="${spotlightTitle} Backdrop" loading="eager" />
          <div class="spotlight-gradient-left"></div>
          <div class="spotlight-gradient-bottom"></div>
          
          <div class="spotlight-content">
            <div class="spotlight-card">
              <div class="spotlight-badge">
                <i data-lucide="trophy" style="width:12px;height:12px;margin-right:4px"></i>
                Trending Chart #1
              </div>
              ${logoHTML}
              <div class="spotlight-meta">
                <span class="spotlight-rating">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ${rating}
                </span>
                <span class="spotlight-dot"></span>
                <span>${year}</span>
                <span class="spotlight-dot"></span>
                <span>${spotlightType === 'tv' ? 'TV Series' : 'Movie'}</span>
              </div>
              <p class="spotlight-overview">${overview}</p>
              <div class="spotlight-actions">
                <button class="hero-btn hero-btn-primary" data-action="play" data-route="${playRoute}">
                  <i data-lucide="play" style="width:16px;height:16px"></i>
                  Watch Now
                </button>
                <button class="hero-btn hero-btn-secondary" data-action="details" data-route="${spotlightRoute}">
                  <i data-lucide="info" style="width:16px;height:16px"></i>
                  More Info
                </button>
              </div>
            </div>
            
            ${spotlightItem.poster_path 
              ? `<div class="spotlight-poster-wrapper"><img class="spotlight-poster" src="${img.poster(spotlightItem.poster_path)}" alt="${spotlightTitle} Poster" loading="eager" /></div>` 
              : ''
            }
          </div>
        </div>
      `;

      // Chart Card Grid HTML (Ranks #2 - 20)
      const gridHTML = itemsForGrid.map((item, idx) => {
        const itemTitle = item.title || item.name;
        const itemYear = (item.release_date || item.first_air_date || '').slice(0, 4);
        const itemRating = item.vote_average ? item.vote_average.toFixed(1) : '—';
        const rank = idx + 2;
        const itemRoute = `/${type}/${item.id}`;

        return `
          <div class="ranking-chart-card rank-${rank}" data-route="${itemRoute}">
            <div class="ranking-number-glow">${rank < 10 ? '0' + rank : rank}</div>
            
            ${item.poster_path
              ? `<div class="ranking-card-poster-wrapper"><img class="ranking-card-poster" src="${img.poster(item.poster_path)}" alt="${itemTitle} Poster" loading="lazy" /></div>`
              : `<div class="ranking-card-poster-wrapper" style="background:var(--bg-tertiary)"></div>`
            }
            
            <div class="ranking-card-info">
              <div class="ranking-card-title">${itemTitle}</div>
              <div class="ranking-card-meta">
                <span class="ranking-card-rating">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ${itemRating}
                </span>
                <span class="ranking-card-dot"></span>
                <span>${itemYear}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      listContainer.innerHTML = `
        ${spotlightHTML}
        <div class="ranking-chart-grid">
          ${gridHTML}
        </div>
      `;

      // Click handlings (card clicks route to details, button clicks route specifically)
      listContainer.querySelectorAll('[data-route]').forEach(card => {
        card.addEventListener('click', (e) => {
          const actionBtn = e.target.closest('[data-action]');
          if (actionBtn) {
            e.stopPropagation();
            navigate(actionBtn.dataset.route);
            return;
          }
          navigate(card.dataset.route);
        });
      });

      if (window.lucide) window.lucide.createIcons();

    } catch (err) {
      console.error('Failed to load chart rankings:', err);
      listContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:var(--space-xl)">Failed to load chart rankings. Please check connectivity.</p>';
    }
  }

  // Load default tab
  await loadRanking(currentTab);

  // Tab switcher listeners
  document.querySelectorAll('#ranking-tabs .ranking-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('#ranking-tabs .ranking-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      await loadRanking(currentTab);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}
