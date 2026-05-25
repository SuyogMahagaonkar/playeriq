// ========================================
// PlayerIQ — Dynamic Category Page
// ========================================

import { 
  getMovieBoxHome, 
  searchMovieBox, 
  getLatestNetflix, 
  getLatestPrime,
  getHorrorMovies,
  getRomanceMovies,
  getSciFiMovies,
  getKidsMovies,
  getComedyMovies,
  getAnimeMovies,
  getStudioContent
} from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';

let allItems = [];
let filteredItems = [];
let currentPage = 1;
let tmdbPage = 1;
const ITEMS_PER_PAGE = 12;

function cleanStringForMatching(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '') // remove emojis
    .replace(/[^a-zA-Z0-9\s]/g, '') // remove special symbols
    .replace(/\s+/g, ' ') // normalize spaces
    .toLowerCase()
    .trim();
}

function getEnrichmentQuery(title) {
  if (!title) return 'popular';
  const clean = title
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '') // remove emojis
    .replace(/[^a-zA-Z0-9\s]/g, '') // remove special symbols
    .trim();
    
  const lower = clean.toLowerCase();
  
  // Custom smart keyword mapping for standard categories to pull best results
  if (lower.includes('bollywood') || lower.includes('hindi') || lower.includes('indian')) return 'hindi';
  if (lower.includes('k-drama') || lower.includes('kdrama') || lower.includes('korean')) return 'korean';
  if (lower.includes('horror')) return 'horror';
  if (lower.includes('action')) return 'action';
  if (lower.includes('comedy')) return 'comedy';
  if (lower.includes('anime') || lower.includes('hentai')) return 'anime';
  if (lower.includes('fight') || lower.includes('wwe')) return 'action';
  if (lower.includes('shorts') || lower.includes('short')) return 'short';
  if (lower.includes('history') || lower.includes('personal') || lower.includes('you')) return 'movie';
  if (lower.includes('tv') || lower.includes('show') || lower.includes('series')) return 'tv';
  if (lower.includes('movie') || lower.includes('film')) return 'movie';
  
  // Default to first few words, filtering out generic ones
  const words = clean.split(/\s+/).filter(w => {
    const wl = w.toLowerCase();
    return wl.length > 2 && wl !== 'and' && wl !== 'the' && wl !== 'for' && wl !== 'your' && wl !== 'with' && wl !== 'that' && wl !== 'now';
  });
  
  return words.length > 0 ? words[0] : 'popular';
}

export async function renderCategoryPage({ container, query }) {
  const categoryTitle = query.title || 'Category';
  allItems = [];
  filteredItems = [];
  currentPage = 1;
  tmdbPage = 1;

  const cleanTitle = cleanStringForMatching(categoryTitle);
  const isNetflix = cleanTitle === 'latest from netflix' || cleanTitle === 'netflix';
  const isPrime = cleanTitle === 'latest from prime' || cleanTitle === 'latest from prime video' || cleanTitle === 'prime';
  
  // Genres matching
  const isHorror = cleanTitle.includes('horror');
  const isRomance = cleanTitle.includes('romance') || cleanTitle.includes('romantic');
  const isSciFi = cleanTitle.includes('sci-fi') || cleanTitle.includes('scifi') || cleanTitle.includes('science fiction');
  const isKids = cleanTitle.includes('kids') || cleanTitle.includes('family') || cleanTitle.includes('children');
  const isComedy = cleanTitle.includes('comedy');
  const isAnime = cleanTitle.includes('anime') || cleanTitle.includes('animation');

  // Studios matching
  const isDisney = cleanTitle.includes('disney');
  const isHbo = cleanTitle.includes('hbo');
  const isParamount = cleanTitle.includes('paramount');
  const isMarvel = cleanTitle.includes('marvel');

  const isLiveProvider = isNetflix || isPrime || isHorror || isRomance || isSciFi || isKids || isComedy || isAnime || isDisney || isHbo || isParamount || isMarvel;

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

  const fetchTMDBPage = async (page) => {
    let data;
    if (isNetflix) {
      data = await getLatestNetflix(page);
    } else if (isPrime) {
      data = await getLatestPrime(page);
    } else if (isHorror) {
      data = await getHorrorMovies(page);
    } else if (isRomance) {
      data = await getRomanceMovies(page);
    } else if (isSciFi) {
      data = await getSciFiMovies(page);
    } else if (isKids) {
      data = await getKidsMovies(page);
    } else if (isComedy) {
      data = await getComedyMovies(page);
    } else if (isAnime) {
      data = await getAnimeMovies(page);
    } else if (isDisney) {
      data = await getStudioContent('Disney+', page);
    } else if (isHbo) {
      data = await getStudioContent('HBO Max', page);
    } else if (isParamount) {
      data = await getStudioContent('Paramount+', page);
    } else if (isMarvel) {
      data = await getStudioContent('Marvel', page);
    } else {
      data = { results: [] };
    }

    return (data.results || []).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: item.media_type || 'movie'
    }));
  };

  try {
    if (isLiveProvider) {
      console.log(`[CategoryPage] Fetching page 1 of live ${categoryTitle} catalog...`);
      const pageItems = await fetchTMDBPage(1);
      allItems = [...pageItems];
    } else {
      const homeData = await getMovieBoxHome();
      const items = homeData.items || [];
      
      // Find the row matches by title robustly
      const rowObj = items.find(i => {
        if (!i.title) return false;
        const cleanRowTitle = cleanStringForMatching(i.title);
        const cleanTargetTitle = cleanStringForMatching(categoryTitle);
        return cleanRowTitle === cleanTargetTitle;
      });
      
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
    }

    filteredItems = [...allItems];
    renderGrid(isLiveProvider);

    // ---- BACKGROUND ENRICHMENT: Fetch MORE like this category (Skipped for live providers!) ----
    if (!isLiveProvider) {
      const enrichmentKeyword = getEnrichmentQuery(categoryTitle);
      if (enrichmentKeyword) {
        searchMovieBox(enrichmentKeyword).then(data => {
          if (data.results && data.results.length > 0) {
            const searchItems = data.results.map(m => ({
              id: `mb_${m.subject_id || m.id || m.subjectId}`,
              title: m.title,
              name: m.title,
              poster_path: m.cover?.url || m.cover_url || m.poster_path,
              backdrop_path: m.backdrop_path || m.cover?.url || m.cover_url || m.poster_path,
              vote_average: m.imdbRate || m.rating || null,
              release_date: m.releaseDate || m.release_date || m.year,
              media_type: m.media_type || (m.subjectType === 2 ? 'tv' : 'movie')
            }));

            // Deduplicate items against already existing ones
            const existingIds = new Set(allItems.map(i => i.id));
            const newItems = searchItems.filter(item => !existingIds.has(item.id));

            if (newItems.length > 0) {
              allItems = [...allItems, ...newItems];

              // Re-apply filter if user is currently searching
              const currentQuery = inputEl ? inputEl.value.toLowerCase().trim() : '';
              if (currentQuery) {
                filteredItems = allItems.filter(item => (item.title || '').toLowerCase().includes(currentQuery));
              } else {
                filteredItems = [...allItems];
              }
              renderGrid(false);
            }
          }
        }).catch(err => {
          console.warn('[CategoryPage] Silent background enrichment failed:', err);
        });
      }
    }

    // Event listeners
    inputEl?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (q) {
        filteredItems = allItems.filter(item => (item.title || '').toLowerCase().includes(q));
      } else {
        filteredItems = [...allItems];
      }
      currentPage = 1;
      renderGrid(isLiveProvider);
    });

    container.querySelector('#category-load-more-btn')?.addEventListener('click', async (e) => {
      if (isLiveProvider) {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = 'Loading more...';
        
        try {
          tmdbPage++;
          console.log(`[CategoryPage] Fetching page ${tmdbPage} of live ${categoryTitle} catalog...`);
          const nextItems = await fetchTMDBPage(tmdbPage);
          if (nextItems.length > 0) {
            // Deduplicate
            const existingIds = new Set(allItems.map(i => i.id));
            const freshItems = nextItems.filter(item => !existingIds.has(item.id));
            allItems = [...allItems, ...freshItems];
            
            const currentQuery = inputEl ? inputEl.value.toLowerCase().trim() : '';
            if (currentQuery) {
              filteredItems = allItems.filter(item => (item.title || '').toLowerCase().includes(currentQuery));
            } else {
              filteredItems = [...allItems];
            }
            renderGrid(true);
          } else {
            btn.style.display = 'none';
          }
        } catch (tmdbErr) {
          console.error('[CategoryPage] Live API load more failed:', tmdbErr);
        } finally {
          btn.disabled = false;
          btn.innerHTML = 'Load More Releases';
        }
      } else {
        currentPage++;
        renderGrid(false);
      }
    });

  } catch (err) {
    console.error('Failed to load category catalog:', err);
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Failed to load category catalog.</div>';
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderGrid(isLiveProvider = false) {
  const grid = document.getElementById('category-grid');
  const loadMoreBtn = document.getElementById('category-load-more-btn');
  if (!grid) return;

  const totalItems = filteredItems.length;
  const startIndex = 0;
  // If live provider, render the entire allItems (since pagination is done in backend request)
  const endIndex = isLiveProvider ? totalItems : currentPage * ITEMS_PER_PAGE;
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
    if (isLiveProvider) {
      loadMoreBtn.style.display = totalItems > 0 ? 'block' : 'none';
    } else {
      loadMoreBtn.style.display = endIndex < totalItems ? 'block' : 'none';
    }
  }
}
