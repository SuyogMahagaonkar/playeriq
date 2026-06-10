// ========================================
// PlayerIQ — TV Shows Page (Cinematic Discover)
// ========================================

import { discoverTmdbContent, filterAvailableItems, getMediaImages, img } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { navigate } from '../services/router.js';
import '../styles/ranking.css';


let currentQuery = '';
let isLoading = false;
let currentPage = 1;

// Predefined categories for MovieBox
const CATEGORIES = [
  { id: 'hindi', name: 'Hindi Dubbed' },
  { id: 'korean', name: 'K-Drama' },
  { id: 'action', name: 'Action' },
  { id: 'comedy', name: 'Comedy' },
  { id: 'sci-fi', name: 'Sci-Fi' },
  { id: 'drama', name: 'Drama' },
  { id: 'anime', name: 'Anime' },
];

export async function renderTVShowsPage({ container, query }) {
  currentQuery = query.genre || 'hindi';
  isLoading = false;
  currentPage = 1;

  container.innerHTML = `
    <div class="movie-grid-page">
      <div class="movie-grid-header">
        <h1 class="movie-grid-title">TV Shows</h1>
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

      <!-- Load More Button -->
      <div class="load-more-container" id="load-more-container" style="display: none;">
        <button class="load-more-btn" id="load-more-btn">
          <span>Load More</span>
          <div class="load-more-btn-spinner" id="load-more-btn-spinner" style="display: none;"></div>
        </button>
      </div>
    </div>
    ${createFooter()}
  `;

  // Load initial data
  await loadTVShows(container, false);

  // Genre pill clicks
  document.querySelectorAll('.genre-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentQuery = pill.dataset.query;
      currentPage = 1;
      const grid = document.getElementById('movie-grid');
      if (grid) grid.innerHTML = '';
      await loadTVShows(container, false);
    });
  });

  // Load More Button Click
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      currentPage++;
      await loadTVShows(container, true);
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

async function loadTVShows(container, append = false) {
  if (isLoading) return;
  isLoading = true;
  
  const spotlightEl = document.getElementById('category-spotlight');
  const grid = document.getElementById('movie-grid');
  const loadMoreContainer = document.getElementById('load-more-container');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const loadMoreSpinner = document.getElementById('load-more-btn-spinner');

  if (loadMoreBtn && loadMoreSpinner) {
    loadMoreBtn.disabled = true;
    loadMoreSpinner.style.display = 'inline-block';
  }

  if (!append) {
    if (spotlightEl) {
      spotlightEl.innerHTML = '<div class="load-more-trigger"><div class="load-more-spinner"></div></div>';
    }
    if (grid) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Searching MovieBox...</div>';
    }
    if (loadMoreContainer) {
      loadMoreContainer.style.display = 'none';
    }
  }

  try {
    // Map currentQuery (genre/category) to TMDB discover arguments
    let discoverOptions = { page: currentPage };
    if (currentQuery === 'hindi') {
      discoverOptions.language = 'hi';
    } else if (currentQuery === 'korean') {
      discoverOptions.language = 'ko';
    } else if (currentQuery === 'action') {
      discoverOptions.genre = '10759';
    } else if (currentQuery === 'comedy') {
      discoverOptions.genre = 35;
    } else if (currentQuery === 'sci-fi') {
      discoverOptions.genre = '10765';
    } else if (currentQuery === 'drama') {
      discoverOptions.genre = 18;
    } else if (currentQuery === 'anime') {
      discoverOptions.genre = 16;
      discoverOptions.language = 'ja';
    }

    // Fetch from TMDB
    const tmdbData = await discoverTmdbContent('tv', discoverOptions);
    const tmdbResults = tmdbData.results || [];
    const totalPages = tmdbData.total_pages || 1;

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
      media_type: 'tv'
    }));

    // Filter by MovieBox match
    const matchedItems = await filterAvailableItems(rawList, 'tv');
    
    if (!grid) return;

    if (!append) {
      if (matchedItems.length === 0) {
        if (spotlightEl) spotlightEl.innerHTML = '';
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No TV shows found.</div>';
      } else {
        const topItem = matchedItems[0];
        const itemsForGrid = matchedItems.slice(1);
        
        const topId = topItem.id;
        const topTitle = topItem.title;
        
        const imagesData = await getMediaImages(topId, 'tv', topTitle).catch(() => null);
        
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
        const overview = topItem.overview || 'Watch the popular series release now.';
        const spotlightRoute = `/tv/${topId}`;
        const playRoute = `/watch/tv/${topId}`;
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

        // Spotlight Hero HTML (Featured TV Show)
        const spotlightHTML = `
          <div class="ranking-spotlight discover-spotlight" data-route="${spotlightRoute}">
            <img class="spotlight-backdrop" src="${img.backdrop(backdropUrl)}" alt="${topTitle} Backdrop" loading="eager" />
            <div class="spotlight-gradient-left"></div>
            <div class="spotlight-gradient-bottom"></div>
            
            <div class="spotlight-content">
              <div class="spotlight-card">
                <div class="spotlight-badge">
                  <i data-lucide="sparkles" style="width:12px;height:12px;margin-right:4px"></i>
                  Featured TV Show
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
                  <span>TV Series</span>
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

        if (spotlightEl) spotlightEl.innerHTML = spotlightHTML;

        // Render remaining TV series in the grid
        const cards = itemsForGrid.map(m => {
          const mapped = {
            id: m.id,
            title: m.title,
            poster_path: m.poster_path,
            vote_average: m.vote_average,
            release_date: m.release_date,
          };
          return createMovieCard(mapped, 'tv');
        }).join('');
        
        grid.innerHTML = cards;
        attachCardClicks(grid);

        // Clicks for spotlight
        if (spotlightEl) {
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
        }
      }
    } else {
      // Append mode (page > 1)
      if (matchedItems.length > 0) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = matchedItems.map(m => {
          const mapped = {
            id: m.id,
            title: m.title,
            poster_path: m.poster_path,
            vote_average: m.vote_average,
            release_date: m.release_date,
          };
          return createMovieCard(mapped, 'tv');
        }).join('');
        
        // Append all child elements to grid
        while (tempDiv.firstChild) {
          grid.appendChild(tempDiv.firstChild);
        }
        attachCardClicks(grid);
      }
    }

    // Toggle Load More Button container visibility
    if (loadMoreContainer) {
      if (matchedItems.length > 0 && currentPage < totalPages) {
        loadMoreContainer.style.display = 'flex';
      } else {
        loadMoreContainer.style.display = 'none';
      }
    }
    
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('TV Shows load error:', err);
    if (!append && grid) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Failed to load TV shows.</div>';
    }
  }

  if (loadMoreBtn && loadMoreSpinner) {
    loadMoreBtn.disabled = false;
    loadMoreSpinner.style.display = 'none';
  }
  isLoading = false;
}
