// ========================================
// PlayerIQ — Dynamic Category Page
// ========================================

import { getMovieBoxHome, searchMovieBox } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';

let allItems = [];
let filteredItems = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 12;

export async function renderCategoryPage({ container, query }) {
  const categoryTitle = query.title || 'Category';
  allItems = [];
  filteredItems = [];
  currentPage = 1;

  container.innerHTML = `
    <div class="movie-grid-page animate-fade-in">
      <div class="movie-grid-header" style="background: linear-gradient(135deg, rgba(255, 0, 85, 0.08) 0%, rgba(20,20,25,0) 100%); padding: 30px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 30px;">
        <h1 class="movie-grid-title" style="margin: 0 0 8px 0; font-size: 2.2rem; background: linear-gradient(90deg, #fff, var(--text-muted)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${categoryTitle}</h1>
        <p style="color: var(--text-dim); margin: 0 0 20px 0;">Browse and search all releases inside the "${categoryTitle}" catalog.</p>
        
        <!-- Search bar inside category -->
        <div class="search-input-wrapper" style="position: relative; max-width: 480px;">
          <input type="text" id="category-search-input" placeholder="Search within ${categoryTitle}..." style="width: 100%; padding: 14px 20px 14px 48px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #fff; font-size: 15px; outline: none; transition: all 0.2s;" />
          <svg style="position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--text-dim);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
      </div>

      <div class="movie-grid stagger-children" id="category-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px;"></div>
      
      <!-- Load More Trigger -->
      <div id="category-load-more-container" style="display: flex; justify-content: center; margin-top: 40px; margin-bottom: 20px;">
        <button id="category-load-more-btn" class="genre-pill" style="padding: 12px 28px; font-size: 15px; font-weight: 600; cursor: pointer; display: none;">
          Load More Releases
        </button>
      </div>
    </div>
    ${createFooter()}
  `;

  const inputEl = container.querySelector('#category-search-input');
  
  // Style overrides for active hover focus state on category search input
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    #category-search-input:focus {
      border-color: #ff0055 !important;
      background: rgba(255,0,85,0.04) !important;
      box-shadow: 0 0 15px rgba(255,0,85,0.15) !important;
    }
  `;
  container.appendChild(styleEl);

  // Load category items from home API
  const grid = container.querySelector('#category-grid');
  if (grid) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><div class="load-more-spinner" style="margin: 0 auto 15px;"></div>Loading Catalog...</div>';
  }

  try {
    const homeData = await getMovieBoxHome();
    const items = homeData.items || [];
    
    // Find the row matches by title
    const rowObj = items.find(i => i.title && i.title.toLowerCase().trim() === categoryTitle.toLowerCase().trim());
    
    if (rowObj) {
      let rawItems = [];
      if (rowObj.type === 'SUBJECTS_MOVIE' || rowObj.type === 'APPOINTMENT_LIST') {
        rawItems = rowObj.subjects || [];
      } else if (rowObj.type === 'CUSTOM') {
        rawItems = (rowObj.customData?.items || []).map(ci => ci.subject).filter(Boolean);
      }

      allItems = rawItems.map(mbItem => ({
        id: `mb_${mbItem.subjectId || mbItem.id}`,
        title: mbItem.title,
        name: mbItem.title,
        poster_path: mbItem.cover?.url || mbItem.cover_url || mbItem.poster_path,
        backdrop_path: mbItem.cover?.url || mbItem.cover_url || mbItem.backdrop_path,
        vote_average: mbItem.imdbRate || mbItem.rating ? parseFloat(mbItem.imdbRate || mbItem.rating) : null,
        release_date: mbItem.releaseDate || mbItem.release_date,
        media_type: mbItem.subjectType === 1 ? 'movie' : 'tv'
      }));
    }

    filteredItems = [...allItems];
    renderGrid();

    // Event listeners
    inputEl?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (q) {
        filteredItems = allItems.filter(item => (item.title || '').toLowerCase().includes(q));
      } else {
        filteredItems = [...allItems];
      }
      currentPage = 1;
      renderGrid();
    });

    container.querySelector('#category-load-more-btn')?.addEventListener('click', () => {
      currentPage++;
      renderGrid(true);
    });

  } catch (err) {
    console.error('Failed to load category catalog:', err);
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Failed to load category catalog.</div>';
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderGrid(append = false) {
  const grid = document.getElementById('category-grid');
  const loadMoreBtn = document.getElementById('category-load-more-btn');
  if (!grid) return;

  const totalItems = filteredItems.length;
  const startIndex = 0;
  const endIndex = currentPage * ITEMS_PER_PAGE;
  const pageItems = filteredItems.slice(startIndex, endIndex);

  if (totalItems === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No releases found matching your search.</div>';
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  const cards = pageItems.map(item => createMovieCard(item, item.media_type)).join('');
  grid.innerHTML = cards;
  attachCardClicks(grid);

  if (loadMoreBtn) {
    loadMoreBtn.style.display = endIndex < totalItems ? 'block' : 'none';
  }
}
