// ========================================
// PlayerIQ — Movies Page (Cinematic Discover)
// ========================================

import { discoverTmdbContent, filterAvailableItems, getMediaImages, img } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { navigate } from '../services/router.js';
import '../styles/ranking.css';


let currentQuery = '';
let isLoading = false;

// Predefined categories for MovieBox
const CATEGORIES = [
  { id: 'hindi', name: 'Hindi Dubbed' },
  { id: 'action', name: 'Action' },
  { id: 'comedy', name: 'Comedy' },
  { id: 'horror', name: 'Horror' },
  { id: 'sci-fi', name: 'Sci-Fi' },
  { id: 'romance', name: 'Romance' },
  { id: 'drama', name: 'Drama' },
  { id: 'animation', name: 'Animation' },
];

export async function renderMoviesPage({ container, query }) {
  currentQuery = query.genre || 'hindi';
  isLoading = false;

  container.innerHTML = `
    <div class="movie-grid-page">
      <div class="movie-grid-header">
        <h1 class="movie-grid-title">Movies</h1>
      </div>
      <div class="genre-pills" id="genre-pills">
        ${CATEGORIES.map(g => `
          <button class="genre-pill ${currentQuery === g.id ? 'active' : ''}" data-query="${g.id}">${g.name}</button>
        `).join('')}
      </div>
      
      <!-- Dynamic Category Spotlight Banner -->
      <div id="category-spotlight">
        <div class="load-more-trigger"><div class="load-more-spinner"></div></div>
      </div>
      
      <div class="movie-grid stagger-children" id="movie-grid"></div>
    </div>
    ${createFooter()}
  `;

  // Load initial data
  await loadMovies(container);

  // Genre pill clicks
  document.querySelectorAll('.genre-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentQuery = pill.dataset.query;
      document.getElementById('movie-grid').innerHTML = '';
      await loadMovies(container);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

async function loadMovies(container) {
  if (isLoading) return;
  isLoading = true;
  
  const spotlightEl = document.getElementById('category-spotlight');
  const grid = document.getElementById('movie-grid');
  
  if (spotlightEl && !spotlightEl.innerHTML) {
    spotlightEl.innerHTML = '<div class="load-more-trigger"><div class="load-more-spinner"></div></div>';
  }
  if (grid && !grid.innerHTML) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Searching MovieBox...</div>';
  }

  try {
    // Map currentQuery (genre/category) to TMDB discover arguments
    let discoverOptions = {};
    if (currentQuery === 'hindi') {
      discoverOptions = { language: 'hi' };
    } else if (currentQuery === 'action') {
      discoverOptions = { genre: 28 };
    } else if (currentQuery === 'comedy') {
      discoverOptions = { genre: 35 };
    } else if (currentQuery === 'horror') {
      discoverOptions = { genre: 27 };
    } else if (currentQuery === 'sci-fi') {
      discoverOptions = { genre: 878 };
    } else if (currentQuery === 'romance') {
      discoverOptions = { genre: 10749 };
    } else if (currentQuery === 'drama') {
      discoverOptions = { genre: 18 };
    } else if (currentQuery === 'animation') {
      discoverOptions = { genre: 16 };
    }

    // Fetch from TMDB
    const tmdbData = await discoverTmdbContent('movie', discoverOptions);
    const tmdbResults = tmdbData.results || [];

    // Map TMDB structure
    const rawList = tmdbResults.map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      overview: item.overview,
      media_type: 'movie'
    }));

    // Filter by MovieBox match
    const matchedItems = await filterAvailableItems(rawList, 'movie');
    
    if (!spotlightEl || !grid) return;

    if (matchedItems.length === 0) {
      spotlightEl.innerHTML = '';
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No movies found.</div>';
    } else {
      const topItem = matchedItems[0];
      const itemsForGrid = matchedItems.slice(1);
      
      const topId = topItem.id;
      const topTitle = topItem.title;
      
      const imagesData = await getMediaImages(topId, 'movie', topTitle).catch(() => null);
      
      let logoHTML = `<h1 class="spotlight-title">${topTitle}</h1>`;
      if (imagesData && imagesData.logos && imagesData.logos.length > 0) {
        const enLogo = imagesData.logos.find(l => l.iso_639_1 === 'en');
        const hiLogo = imagesData.logos.find(l => l.iso_639_1 === 'hi');
        const bestLogo = enLogo || hiLogo || imagesData.logos[0];
        if (bestLogo) {
          logoHTML = `
            <div class="spotlight-logo-container">
              <img class="spotlight-logo-img" src="https://image.tmdb.org/t/p/w500${bestLogo.file_path}" alt="${topTitle} Logo" />
            </div>
          `;
        }
      }

      const rating = topItem.vote_average ? parseFloat(topItem.vote_average).toFixed(1) : '—';
      const year = (topItem.release_date || '').slice(0, 4);
      const overview = topItem.overview || 'Watch the popular movie release now.';
      const spotlightRoute = `/movie/${topId}`;
      const playRoute = `/watch/movie/${topId}`;
      const backdropUrl = topItem.backdrop_path || topItem.poster_path || '';

      const maxChars = 85;
      let overviewHTML = '';
      if (overview.length > maxChars) {
        const truncated = overview.slice(0, maxChars).trim() + '...';
        overviewHTML = `
          <span class="overview-text" data-full="${overview.replace(/"/g, '&quot;')}" data-truncated="${truncated.replace(/"/g, '&quot;')}">${truncated}</span>
          <span class="spotlight-more-btn" style="color:#A020F0; font-weight:700; cursor:pointer; margin-left:4px; font-size:10px; text-transform:uppercase; letter-spacing:0.3px;">more</span>
        `;
      } else {
        overviewHTML = `<span>${overview}</span>`;
      }

      // Spotlight Hero HTML (Featured Movie)
      const spotlightHTML = `
        <div class="ranking-spotlight discover-spotlight" data-route="${spotlightRoute}">
          <img class="spotlight-backdrop" src="${img.backdrop(backdropUrl)}" alt="${topTitle} Backdrop" loading="eager" />
          <div class="spotlight-gradient-left"></div>
          <div class="spotlight-gradient-bottom"></div>
          
          <div class="spotlight-content">
            <div class="spotlight-card">
              <div class="spotlight-badge">
                <i data-lucide="sparkles" style="width:12px;height:12px;margin-right:4px"></i>
                Featured Movie
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
                <span>Movie</span>
              </div>
              <p class="spotlight-overview">${overviewHTML}</p>
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
            
            ${backdropUrl 
              ? `<div class="spotlight-poster-wrapper"><img class="spotlight-poster" src="${img.poster(backdropUrl)}" alt="${topTitle} Poster" loading="eager" /></div>` 
              : ''
            }
          </div>
        </div>
      `;

      spotlightEl.innerHTML = spotlightHTML;

      // Render remaining movies in the grid
      const cards = itemsForGrid.map(m => {
        const mapped = {
          id: m.id,
          title: m.title,
          poster_path: m.poster_path,
          vote_average: m.vote_average,
          release_date: m.release_date,
        };
        return createMovieCard(mapped, 'movie');
      }).join('');
      
      grid.innerHTML = cards;
      attachCardClicks(grid);

      // Clicks for spotlight
      spotlightEl.querySelectorAll('[data-route]').forEach(card => {
        card.addEventListener('click', (e) => {
          const moreToggle = e.target.closest('.spotlight-more-btn');
          if (moreToggle) {
            e.stopPropagation();
            const textEl = spotlightEl.querySelector('.overview-text');
            if (moreToggle.textContent === 'more') {
              textEl.textContent = textEl.dataset.full;
              moreToggle.textContent = 'less';
            } else {
              textEl.textContent = textEl.dataset.truncated;
              moreToggle.textContent = 'more';
            }
            return;
          }
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
    }
  } catch (err) {
    console.error('Movies load error:', err);
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Failed to load movies.</div>';
  }
  isLoading = false;
}
