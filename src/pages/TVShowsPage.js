// ========================================
// PlayerIQ — TV Shows Page (MovieBox Native)
// ========================================

import { searchMovieBox } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';

let currentQuery = '';
let isLoading = false;

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
      <div class="movie-grid stagger-children" id="movie-grid"></div>
      <div class="load-more-trigger" id="load-more" style="display: none;">
        <div class="load-more-spinner"></div>
      </div>
    </div>
    ${createFooter()}
  `;

  // Load initial data
  await loadTVShows(container);

  // Genre pill clicks
  document.querySelectorAll('.genre-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentQuery = pill.dataset.query;
      document.getElementById('movie-grid').innerHTML = '';
      await loadTVShows(container);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

async function loadTVShows(container) {
  if (isLoading) return;
  isLoading = true;
  const grid = document.getElementById('movie-grid');
  
  if (grid && !grid.innerHTML) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Searching MovieBox...</div>';
  }

  try {
    // Search MovieBox for the category keyword, filter to TV only (type=2)
    const data = await searchMovieBox(currentQuery, '2');
    
    if (!grid) return;

    if (!data.results || data.results.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No TV shows found.</div>';
    } else {
      const cards = data.results.map(m => {
        // Map MovieBox search result to common format
        const mapped = {
          id: `mb_${m.subject_id || m.id || m.subjectId}`,
          title: m.title,
          poster_path: m.cover?.url || m.cover_url || m.poster_path,
          vote_average: m.imdbRate || m.rating || null,
          release_date: m.releaseDate || m.release_date || m.year,
        };
        return createMovieCard(mapped, 'tv');
      }).join('');
      
      grid.innerHTML = cards;
      attachCardClicks(grid);
    }
  } catch (err) {
    console.error('TV Shows load error:', err);
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Failed to load TV shows.</div>';
  }
  isLoading = false;
}
