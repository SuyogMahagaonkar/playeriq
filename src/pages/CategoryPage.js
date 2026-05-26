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
  getStudioContent,
  filterAvailableItems
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
  const lowerTitle = categoryTitle.toLowerCase();
  
  const isNetflix = cleanTitle.includes('netflix') || lowerTitle.includes('netflix');
  const isPrime = cleanTitle.includes('prime') || cleanTitle.includes('amazon') || lowerTitle.includes('prime') || lowerTitle.includes('amazon');
  
  // Genres matching
  const isHorror = cleanTitle.includes('horror') || lowerTitle.includes('horror');
  const isRomance = cleanTitle.includes('romance') || cleanTitle.includes('romantic') || lowerTitle.includes('romance') || lowerTitle.includes('romantic');
  const isSciFi = cleanTitle.includes('sci-fi') || cleanTitle.includes('scifi') || cleanTitle.includes('science fiction') || lowerTitle.includes('sci-fi') || lowerTitle.includes('scifi') || lowerTitle.includes('science fiction');
  const isKids = cleanTitle.includes('kids') || cleanTitle.includes('family') || cleanTitle.includes('children') || lowerTitle.includes('kids') || lowerTitle.includes('family') || lowerTitle.includes('children');
  const isComedy = cleanTitle.includes('comedy') || lowerTitle.includes('comedy');
  const isAnime = cleanTitle.includes('anime') || cleanTitle.includes('animation') || lowerTitle.includes('anime') || lowerTitle.includes('animation');

  // Studios matching
  const isDisney = cleanTitle.includes('disney') || lowerTitle.includes('disney');
  const isHbo = cleanTitle.includes('hbo') || cleanTitle.includes('hbo max') || lowerTitle.includes('hbo') || lowerTitle.includes('hbo max');
  const isParamount = cleanTitle.includes('paramount') || cleanTitle.includes('paramount+') || lowerTitle.includes('paramount') || lowerTitle.includes('paramount+');
  const isMarvel = cleanTitle.includes('marvel') || lowerTitle.includes('marvel');

  const isLiveProvider = isNetflix || isPrime || isHorror || isRomance || isSciFi || isKids || isComedy || isAnime || isDisney || isHbo || isParamount || isMarvel;

  console.log(`[CategoryPage] Diagnostic: categoryTitle="${categoryTitle}", cleanTitle="${cleanTitle}", isDisney=${isDisney}, isPrime=${isPrime}, isLiveProvider=${isLiveProvider}`);

  // Premium dynamic theme configurations based on the catalog type
  let bannerBg = 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
  let accentColor = '#a855f7';
  let shadowColor = 'rgba(168, 85, 247, 0.3)';
  let brandBadge = `<span style="background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); color: #a855f7; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Premium Selection</span>`;
  let bannerIcon = '🍿';

  if (isNetflix) {
    bannerBg = 'linear-gradient(135deg, rgba(229, 9, 20, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#e50914';
    shadowColor = 'rgba(229, 9, 20, 0.35)';
    brandBadge = `<span style="background: rgba(229, 9, 20, 0.15); border: 1px solid rgba(229, 9, 20, 0.4); color: #e50914; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Netflix Originals</span>`;
    bannerIcon = '🎬';
  } else if (isPrime) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 168, 225, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#00a8e1';
    shadowColor = 'rgba(0, 168, 225, 0.35)';
    brandBadge = `<span style="background: rgba(0, 168, 225, 0.15); border: 1px solid rgba(0, 168, 225, 0.4); color: #00a8e1; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Amazon Prime Video</span>`;
    bannerIcon = '💙';
  } else if (isDisney) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 102, 204, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#0066cc';
    shadowColor = 'rgba(0, 102, 204, 0.35)';
    brandBadge = `<span style="background: rgba(0, 102, 204, 0.15); border: 1px solid rgba(0, 102, 204, 0.4); color: #0066cc; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Disney+ Exclusive</span>`;
    bannerIcon = '✨';
  } else if (isHbo) {
    bannerBg = 'linear-gradient(135deg, rgba(153, 51, 255, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#9933ff';
    shadowColor = 'rgba(153, 51, 255, 0.35)';
    brandBadge = `<span style="background: rgba(153, 51, 255, 0.15); border: 1px solid rgba(153, 51, 255, 0.4); color: #9933ff; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">HBO Max Originals</span>`;
    bannerIcon = '👑';
  } else if (isParamount) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 102, 255, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#0066ff';
    shadowColor = 'rgba(0, 102, 255, 0.35)';
    brandBadge = `<span style="background: rgba(0, 102, 255, 0.15); border: 1px solid rgba(0, 102, 255, 0.4); color: #0066ff; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Paramount+ Original</span>`;
    bannerIcon = '🏔️';
  } else if (isMarvel) {
    bannerBg = 'linear-gradient(135deg, rgba(237, 29, 36, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#ed1d24';
    shadowColor = 'rgba(237, 29, 36, 0.35)';
    brandBadge = `<span style="background: rgba(237, 29, 36, 0.15); border: 1px solid rgba(237, 29, 36, 0.4); color: #ed1d24; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Marvel Studios</span>`;
    bannerIcon = '🛡️';
  } else if (isHorror) {
    bannerIcon = '👻';
    brandBadge = `<span style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Horror & Thriller</span>`;
    accentColor = '#ef4444';
    shadowColor = 'rgba(239, 68, 68, 0.3)';
  } else if (isRomance) {
    bannerIcon = '💖';
    brandBadge = `<span style="background: rgba(236, 72, 153, 0.15); border: 1px solid rgba(236, 72, 153, 0.4); color: #ec4899; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Romance Selection</span>`;
    accentColor = '#ec4899';
    shadowColor = 'rgba(236, 72, 153, 0.3)';
  } else if (isSciFi) {
    bannerIcon = '🚀';
    brandBadge = `<span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Sci-Fi & Fantasy</span>`;
    accentColor = '#10b981';
    shadowColor = 'rgba(16, 185, 129, 0.3)';
  } else if (isComedy) {
    bannerIcon = '😂';
    brandBadge = `<span style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Comedy Catalog</span>`;
    accentColor = '#f59e0b';
    shadowColor = 'rgba(245, 158, 11, 0.3)';
  } else if (isAnime) {
    bannerIcon = '🌸';
    brandBadge = `<span style="background: rgba(251, 113, 133, 0.15); border: 1px solid rgba(251, 113, 133, 0.4); color: #fb7185; padding: 4px 12px; border-radius: 30px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: inline-block;">Anime Classics</span>`;
    accentColor = '#fb7185';
    shadowColor = 'rgba(251, 113, 133, 0.3)';
  }

  container.innerHTML = `
    <div class="movie-grid-page animate-fade-in">
      <div class="movie-grid-header" style="background: ${bannerBg}; padding: 40px; border-radius: 20px; border: 1.5px solid rgba(255,255,255,0.08); margin-bottom: 35px; box-shadow: 0 15px 40px rgba(0,0,0,0.5), inset 0 0 30px rgba(255,255,255,0.02); display: flex; flex-direction: column; position: relative; overflow: hidden;">
        <!-- Backdrop glowing light effect -->
        <div style="position: absolute; top: -50px; right: -50px; width: 180px; height: 180px; background: ${accentColor}; opacity: 0.15; filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
        
        <div>
          ${brandBadge}
          <h1 class="movie-grid-title" style="margin: 0 0 10px 0; font-size: 2.5rem; font-weight: 800; font-family: var(--font-display); letter-spacing: -0.02em; display: flex; align-items: center; gap: 12px; background: linear-gradient(90deg, #fff 40%, rgba(255,255,255,0.7) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            <span>${bannerIcon}</span>
            <span>${categoryTitle}</span>
          </h1>
          <p style="color: var(--text-secondary); margin: 0 0 24px 0; font-size: var(--text-md); line-height: 1.5; max-width: 600px; font-family: var(--font-body); letter-spacing: 0.01em;">
            Browse and search all releases inside the premium <strong>${categoryTitle}</strong> library. Immerse yourself in our handpicked collection of high-fidelity streams.
          </p>
        </div>
        
        <!-- Search bar inside category -->
        <div class="search-input-wrapper" style="position: relative; max-width: 480px;">
          <input type="text" id="category-search-input" placeholder="Search within ${categoryTitle}..." style="width: 100%; padding: 14px 20px 14px 48px; border-radius: 30px; border: 1.5px solid rgba(255,255,255,0.12); background: rgba(0, 0, 0, 0.4); color: #fff; font-size: 15px; outline: none; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);" />
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
      border-color: ${accentColor} !important;
      background: rgba(0,0,0,0.6) !important;
      box-shadow: 0 0 20px ${shadowColor} !important;
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

    const rawList = (data.results || []).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: item.media_type || 'movie'
    }));

    return await filterAvailableItems(rawList, 'mixed');
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
