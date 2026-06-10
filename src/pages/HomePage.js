import { 
  getLatestNetflix, 
  getLatestPrime, 
  getTop10Movies, 
  getTop10Series, 
  getMediaImages, 
  isSafeItem, 
  getTrendingAll, 
  getBollywoodMovies, 
  getSouthIndianMovies, 
  getCinemaMovies,
  getHorrorMovies,
  getRomanceMovies,
  getSciFiMovies,
  getKidsMovies,
  getComedyMovies,
  getAnimeMovies,
  filterAvailableItems
} from '../services/api.js';
import { createHeroBanner, initHeroBanner } from '../components/HeroBanner.js';
import { createContentRow, createSkeletonRow, initContentRows } from '../components/ContentRow.js';
import { createMovieCard } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { getWatchHistory, removeFromHistory as removeProgress } from '../services/auth.js';

export async function renderHomePage({ container }) {
  // 1. Render complete skeletons instantly (zero network latency block!)
  container.innerHTML = `
    <div class="homepage-container animate-fade-in">
      <!-- Hero Banner Mount -->
      <div id="hero-banner-container">
        <div style="height:600px;background:var(--bg-secondary);animation:shimmer 2s infinite;background-size:200% 100%;background-image:linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);"></div>
      </div>
      
      <!-- Mobile Category Grid Overhauled to Featured Studios -->
      <div id="home-category-grid-container" class="home-category-grid">
        <div class="category-grid-item" data-route="/category?title=Disney%2B">
          <div class="category-grid-icon">
            <img class="studio-logo studio-logo-white" src="/disney-logo.svg" alt="Disney+" style="max-width:85%; max-height:80%; object-fit:contain;" />
          </div>
        </div>
        <div class="category-grid-item" data-route="/category?title=Netflix">
          <div class="category-grid-icon">
            <img class="studio-logo studio-logo-white" src="/netflix-logo.svg" alt="Netflix" style="max-width:85%; max-height:80%; object-fit:contain;" />
          </div>
        </div>
        <div class="category-grid-item" data-route="/category?title=Amazon%20Prime%20Video">
          <div class="category-grid-icon">
            <img class="studio-logo studio-logo-white" src="/prime-logo.png" alt="Prime Video" style="max-width:85%; max-height:80%; object-fit:contain;" />
          </div>
        </div>
        <div class="category-grid-item" data-route="/category?title=Marvel">
          <div class="category-grid-icon">
            <img class="studio-logo studio-logo-white" src="/marvel-logo-white.svg" alt="Marvel" style="max-width:85%; max-height:80%; object-fit:contain;" />
          </div>
        </div>
        <div class="category-grid-item" data-route="/category?title=HBO%20Max">
          <div class="category-grid-icon">
            <img class="studio-logo studio-logo-white" src="/hbo-logo.png" alt="HBO Max" style="max-width:85%; max-height:80%; object-fit:contain;" />
          </div>
        </div>
        <div class="category-grid-item category-grid-item-viewall" data-route="/studios">
          <div class="category-grid-icon"><i data-lucide="layout-grid"></i></div>
          <div class="category-grid-label">View All</div>
        </div>
      </div>
      
      <!-- Continue Watching Row Mount -->
      <div id="continue-watching-row-container"></div>
      
      <!-- Featured Studios Brand Row (Static UI - rendered instantly!) -->
      <div id="featured-studios-row-container">
        <section class="content-row studios-section">
          <div class="content-row-header" style="padding-left: 45px;">
            <h2 class="content-row-title"><i data-lucide="clapperboard" class="search-section-icon" style="color:#ffae00;"></i> Featured Studios</h2>
          </div>
          <div class="content-row-container">
            <button class="content-row-arrow content-row-arrow-left" aria-label="Scroll left">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="studio-row-scroll content-row-scroll">
              <div class="studio-card studio-disney" data-route="/category?title=Disney%2B">
                <img class="studio-logo studio-logo-white" src="/disney-logo.svg" alt="Disney+" />
              </div>
              <div class="studio-card studio-hbo" data-route="/category?title=HBO%20Max">
                <img class="studio-logo studio-logo-white" src="/hbo-logo.png" alt="HBO Max" />
              </div>
              <div class="studio-card studio-netflix" data-route="/category?title=Netflix">
                <img class="studio-logo studio-logo-white" src="/netflix-logo.svg" alt="Netflix" />
              </div>
              <div class="studio-card studio-prime" data-route="/category?title=Amazon%20Prime%20Video">
                <img class="studio-logo studio-logo-white" src="/prime-logo.png" alt="Prime Video" />
              </div>
              <div class="studio-card studio-paramount" data-route="/category?title=Paramount%2B">
                <img class="studio-logo studio-logo-white" src="/paramount-logo.png" alt="Paramount+" />
              </div>
              <div class="studio-card studio-marvel" data-route="/category?title=Marvel">
                <img class="studio-logo" src="/marvel-logo-white.svg" alt="Marvel" />
              </div>
              <div class="studio-card studio-dc" data-route="/category?title=DC%20Studios">
                <img class="studio-logo studio-logo-white" src="/dc-studios-tmdb.png" alt="DC Studios" />
              </div>
              <div class="studio-card studio-wb" data-route="/category?title=Warner%20Bros">
                <img class="studio-logo studio-logo-white" src="/wb-official.svg" alt="Warner Bros" />
              </div>
              <div class="studio-card studio-universal" data-route="/category?title=Universal%20Pictures">
                <img class="studio-logo studio-logo-white" src="/universal-tmdb.png" alt="Universal Pictures" />
              </div>
              <div class="studio-card studio-sony" data-route="/category?title=Sony%20Pictures">
                <img class="studio-logo studio-logo-white" src="/sony-tmdb.png" alt="Sony Pictures" />
              </div>
              <div class="studio-card studio-appletv" data-route="/category?title=Apple%20TV%2B">
                <img class="studio-logo studio-logo-white" src="/appletv-tmdb.png" alt="Apple TV+" />
              </div>
              <div class="studio-card studio-dreamworks" data-route="/category?title=DreamWorks">
                <img class="studio-logo studio-logo-white" src="/dreamworks-tmdb.png" alt="DreamWorks" />
              </div>
            </div>
            <button class="content-row-arrow content-row-arrow-right" aria-label="Scroll right">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </section>
      </div>

      <!-- Top 10 Mobile Toggle -->
      <div id="top10-mobile-toggle-container">
        <div class="top10-mobile-toggle" style="display: none;">
          <div class="top10-toggle-pills">
            <button class="top10-toggle-pill active" data-target="movies">Movies</button>
            <button class="top10-toggle-pill" data-target="shows">Shows</button>
          </div>
          <a href="#/ranking" class="top10-mobile-see-all">See All <i data-lucide="chevron-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></a>
        </div>
      </div>
      
      <!-- Top 10 Mounts -->
      <div id="top10-movies-container"></div>
      <div id="top10-series-container"></div>

      <!-- Discover Shelves Mounts (Pre-rendered as skeletons to preserve visual layout!) -->
      <div id="netflix-row-container">${createSkeletonRow('Latest from Netflix', '', 'portrait')}</div>
      <div id="prime-row-container">${createSkeletonRow('Latest from Prime Video', '', 'portrait')}</div>
      <div id="cinema-row-container">${createSkeletonRow('Cinema Hits', '', 'portrait')}</div>
      <div id="bollywood-row-container">${createSkeletonRow('Bollywood Classics', '', 'portrait')}</div>
      <div id="south-indian-row-container">${createSkeletonRow('South Indian Action', '', 'portrait')}</div>
      <div id="horror-row-container">${createSkeletonRow('Horror Hits', '', 'portrait')}</div>
      <div id="romance-row-container">${createSkeletonRow('Romance & Love', '', 'portrait')}</div>
      <div id="scifi-row-container">${createSkeletonRow('Sci-Fi & Fantasy', '', 'portrait')}</div>
      <div id="kids-row-container">${createSkeletonRow('Family & Kids', '', 'portrait')}</div>
      <div id="comedy-row-container">${createSkeletonRow('Comedy Zone', '', 'portrait')}</div>
      <div id="anime-row-container">${createSkeletonRow('Anime Chronicles', '', 'portrait')}</div>

      <!-- Footer Mount -->
      <div id="footer-mount-container">${createFooter()}</div>
    </div>
  `;

  // Inject outline top 10 style
  const top10Style = document.createElement('style');
  top10Style.innerHTML = `
    .top10-card:hover .top10-number {
      -webkit-text-stroke: 4px var(--accent, #a855f7) !important;
      color: var(--accent-soft, rgba(168, 85, 247, 0.12)) !important;
      filter: drop-shadow(0 0 15px var(--accent-glow, rgba(168, 85, 247, 0.35))) !important;
    }
  `;
  container.appendChild(top10Style);

  let cleanupHero = () => {};
  const activeObservers = [];

  // Helper map raw TMDB results to standard schema
  const mapToStandard = (results, defaultMediaType) => {
    return (results || []).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: item.media_type || defaultMediaType
    }));
  };

  // Delete event handler for Continue Watching
  const deleteHandler = (e) => {
    const id = e.detail.id;
    if (id) {
      removeProgress(id);
      container.removeEventListener('delete-progress', deleteHandler);
      renderHomePage({ container });
    }
  };
  container.addEventListener('delete-progress', deleteHandler);

  try {
    // ========================================
    // STAGE 1: Immediate Viewport Hydration (<500ms)
    // ========================================
    
    // 1. Fetch & Hydrate Above-The-Fold viewports
    const [trendingAllData, top10MoviesData, top10SeriesData] = await Promise.all([
      getTrendingAll().catch(() => ({ results: [] })),
      getTop10Movies().catch(() => ({ results: [] })),
      getTop10Series().catch(() => ({ results: [] }))
    ]);

    // 2. Hydrate Hero Spotlight Banner
    const banners = (trendingAllData.results || []).slice(0, 10);
    const addedTitles = new Set();
    const finalHeroItemsBase = [];
    
    const isDuplicateTitle = (candidateTitle) => {
      const cleanCandidate = (candidateTitle || '').replace(/\[.*?\]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (!cleanCandidate) return true;
      for (const added of addedTitles) {
        if (added === cleanCandidate || added.includes(cleanCandidate) || cleanCandidate.includes(added)) {
          return true;
        }
      }
      return false;
    };

    // Filter unique banners
    banners.forEach(b => {
      if (finalHeroItemsBase.length >= 6) return;
      const title = b.title || b.name;
      if (!isDuplicateTitle(title)) {
        addedTitles.add(title.replace(/\[.*?\]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim());
        finalHeroItemsBase.push({
          id: b.id,
          title: title,
          name: title,
          backdrop_path: b.backdrop_path,
          poster_path: b.poster_path,
          overview: b.overview || '',
          media_type: b.media_type || 'movie'
        });
      }
    });

    const heroItems = await Promise.all(finalHeroItemsBase.map(async (item) => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/${item.media_type}/${item.id}?api_key=8e4ad9e56e31ab079517b5be6965b477&append_to_response=images&include_image_language=en,hi,null`);
        if (res.ok) {
          const tmdbData = await res.json();
          return {
            ...item,
            vote_average: tmdbData.vote_average || item.vote_average,
            release_date: tmdbData.release_date || tmdbData.first_air_date || item.release_date,
            first_air_date: tmdbData.first_air_date || tmdbData.release_date || item.first_air_date,
            overview: tmdbData.overview || item.overview,
            backdrop_path: tmdbData.backdrop_path || item.backdrop_path,
            poster_path: tmdbData.poster_path || item.poster_path,
            images: tmdbData.images
          };
        }
      } catch (e) {
        console.warn('Hero banner details fetch failed', e);
      }
      return item;
    }));

    const heroMount = container.querySelector('#hero-banner-container');
    if (heroMount) {
      heroMount.innerHTML = createHeroBanner(heroItems);
      cleanupHero = initHeroBanner();
    }

    // 3. Hydrate Continue Watching in the background (non-blocking)
    getWatchHistory().then(watchHistoryData => {
      if (!watchHistoryData || watchHistoryData.length === 0) return;

      const getMillis = (timestamp) => {
        if (!timestamp) return 0;
        if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
        if (typeof timestamp === 'number') return timestamp;
        if (timestamp instanceof Date) return timestamp.getTime();
        const parsed = Date.parse(timestamp);
        return isNaN(parsed) ? 0 : parsed;
      };

      let continueWatchingItems = watchHistoryData.filter(item => {
        if (item.watched) return false;
        const pct = item.duration > 0 ? (item.currentTime / item.duration) : 0;
        if (item.duration > 0 && (pct >= 0.90 || (item.duration - item.currentTime <= 300))) return false;
        return true;
      });

      const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
      if (isSafe) {
        continueWatchingItems = continueWatchingItems.filter(isSafeItem);
      }

      const tvLatestEpisodes = {};
      const finalContinueWatching = [];

      continueWatchingItems.forEach(item => {
        if (item.type === 'tv') {
          const existing = tvLatestEpisodes[item.id];
          const itemTime = getMillis(item.timestamp);
          if (!existing || itemTime > getMillis(existing.timestamp)) {
            tvLatestEpisodes[item.id] = item;
          }
        } else {
          finalContinueWatching.push(item);
        }
      });

      Object.keys(tvLatestEpisodes).forEach(showId => {
        finalContinueWatching.push(tvLatestEpisodes[showId]);
      });

      finalContinueWatching.sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));
      continueWatchingItems = finalContinueWatching;

      const continueWatchingMount = container.querySelector('#continue-watching-row-container');
      if (continueWatchingMount && continueWatchingItems.length > 0) {
        const historyCards = continueWatchingItems.map(item => {
          const route = item.type === 'tv' 
            ? `/watch/tv/${item.id}?s=${item.season}&e=${item.episode}` 
            : `/watch/movie/${item.id}`;
          const subtitle = item.type === 'tv' ? `S${item.season} E${item.episode}` : 'Movie';
          return createMovieCard(item, item.type, route, subtitle, item, true, 'landscape');
        }).join('');

        continueWatchingMount.innerHTML = createContentRow(
          '<i data-lucide="play-circle"></i> Continue Watching', 
          historyCards, 
          'custom'
        );
        initContentRows(continueWatchingMount);
        if (window.lucide) window.lucide.createIcons();
      }
    }).catch(err => {
      console.warn('Failed to hydrate watch history:', err);
    });

    // 4. Hydrate Top 10 Movies Row
    const topMovies = top10MoviesData.results || [];
    const topMoviesMount = container.querySelector('#top10-movies-container');
    if (topMoviesMount && topMovies.length > 0) {
      const topMoviesCards = topMovies.map((item, index) => {
        const route = `/movie/${item.id}`;
        const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'data:image/svg+xml,...';
        return `
          <div class="top10-card" data-route="${route}" style="
            position: relative;
            display: flex;
            align-items: flex-end;
            width: 190px;
            height: 240px;
            flex-shrink: 0;
            margin-left: 20px;
            margin-right: 10px;
            cursor: pointer;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          "
          onmouseover="this.style.transform='scale(1.05) translateY(-5px)';"
          onmouseout="this.style.transform='none';"
          >
            <div class="top10-number" style="
              font-size: 150px;
              font-weight: 900;
              line-height: 0.8;
              color: #0b0b0f;
              -webkit-text-stroke: 4px rgba(255, 255, 255, 0.45);
              position: absolute;
              left: -30px;
              bottom: 0px;
              z-index: 1;
              user-select: none;
              font-family: 'Arial Black', Impact, sans-serif;
              transition: all 0.3s;
            ">${index + 1}</div>
            
            <div class="top10-poster-wrapper" style="
              width: 140px;
              height: 210px;
              border-radius: 8px;
              overflow: hidden;
              z-index: 2;
              border: 1px solid rgba(255, 255, 255, 0.08);
              box-shadow: 0 10px 25px rgba(0,0,0,0.5);
              position: absolute;
              right: 0;
              bottom: 15px;
            ">
              <img src="${posterUrl}" alt="${item.title}" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>
          </div>
        `;
      }).join('');

      topMoviesMount.innerHTML = `
        <section class="content-row top10-movies-section">
          <div class="content-row-header" style="padding-left: 45px; display: flex; justify-content: space-between; align-items: center;">
            <h2 class="content-row-title"><i data-lucide="trending-up" class="search-section-icon" style="color: var(--accent);"></i> Top 10 Movies Today</h2>
            <a href="#/ranking" class="top10-see-all-desktop" style="color: var(--accent); font-size: 13px; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px; margin-right: 45px;">See All <i data-lucide="chevron-right" style="width:16px;height:16px;"></i></a>
          </div>
          <div class="content-row-scroll-wrapper" style="position: relative;">
            <div class="content-row-cards" style="display: flex; gap: 0px; overflow-x: auto; padding: 20px 20px 20px 45px; scrollbar-width: none; overflow-y: hidden;">
              ${topMoviesCards}
            </div>
          </div>
        </section>
      `;
    }

    // 5. Hydrate Top 10 Series Row
    const topSeries = top10SeriesData.results || [];
    const topSeriesMount = container.querySelector('#top10-series-container');
    if (topSeriesMount && topSeries.length > 0) {
      const topSeriesCards = topSeries.map((item, index) => {
        const route = `/tv/${item.id}`;
        const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'data:image/svg+xml,...';
        return `
          <div class="top10-card" data-route="${route}" style="
            position: relative;
            display: flex;
            align-items: flex-end;
            width: 190px;
            height: 240px;
            flex-shrink: 0;
            margin-left: 20px;
            margin-right: 10px;
            cursor: pointer;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          "
          onmouseover="this.style.transform='scale(1.05) translateY(-5px)';"
          onmouseout="this.style.transform='none';"
          >
            <div class="top10-number" style="
              font-size: 150px;
              font-weight: 900;
              line-height: 0.8;
              color: #0b0b0f;
              -webkit-text-stroke: 4px rgba(255, 255, 255, 0.45);
              position: absolute;
              left: -30px;
              bottom: 0px;
              z-index: 1;
              user-select: none;
              font-family: 'Arial Black', Impact, sans-serif;
              transition: all 0.3s;
            ">${index + 1}</div>
            
            <div class="top10-poster-wrapper" style="
              width: 140px;
              height: 210px;
              border-radius: 8px;
              overflow: hidden;
              z-index: 2;
              border: 1px solid rgba(255, 255, 255, 0.08);
              box-shadow: 0 10px 25px rgba(0,0,0,0.5);
              position: absolute;
              right: 0;
              bottom: 15px;
            ">
              <img src="${posterUrl}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>
          </div>
        `;
      }).join('');

      topSeriesMount.innerHTML = `
        <section class="content-row top10-shows-section">
          <div class="content-row-header" style="padding-left: 45px; display: flex; justify-content: space-between; align-items: center;">
            <h2 class="content-row-title"><i data-lucide="trending-up" class="search-section-icon" style="color: var(--accent);"></i> Top 10 Shows Today</h2>
            <a href="#/ranking" class="top10-see-all-desktop" style="color: var(--accent); font-size: 13px; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px; margin-right: 45px;">See All <i data-lucide="chevron-right" style="width:16px;height:16px;"></i></a>
          </div>
          <div class="content-row-scroll-wrapper" style="position: relative;">
            <div class="content-row-cards" style="display: flex; gap: 0px; overflow-x: auto; padding: 20px 20px 20px 45px; scrollbar-width: none; overflow-y: hidden;">
              ${topSeriesCards}
            </div>
          </div>
        </section>
      `;
    }

    // Initialize top rows interactivity
    initContentRows(container);
    if (window.lucide) window.lucide.createIcons();

    // Wire up Mobile top 10 pills toggling
    const toggleMount = container.querySelector('.top10-mobile-toggle');
    if (toggleMount) {
      if (window.innerWidth <= 768) {
        toggleMount.style.display = 'flex';
      }
      
      const togglePills = container.querySelectorAll('.top10-toggle-pill');
      const moviesSection = container.querySelector('.top10-movies-section');
      const showsSection = container.querySelector('.top10-shows-section');

      togglePills.forEach(pill => {
        pill.addEventListener('click', () => {
          togglePills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');

          const target = pill.dataset.target;
          if (target === 'movies') {
            if (moviesSection) moviesSection.style.setProperty('display', 'block', 'important');
            if (showsSection) showsSection.style.setProperty('display', 'none', 'important');
          } else {
            if (moviesSection) moviesSection.style.setProperty('display', 'none', 'important');
            if (showsSection) showsSection.style.setProperty('display', 'block', 'important');
          }
        });
      });

      if (window.innerWidth <= 768) {
        if (moviesSection) moviesSection.style.setProperty('display', 'block', 'important');
        if (showsSection) showsSection.style.setProperty('display', 'none', 'important');
      }
    }

    // Wire up static Studio card clicks
    container.querySelectorAll('.studio-card').forEach(card => {
      card.addEventListener('click', () => {
        const route = card.dataset.route;
        if (route) window.location.hash = route;
      });
    });

    // Wire up category grid clicks
    container.querySelectorAll('.category-grid-item').forEach(card => {
      card.addEventListener('click', () => {
        const route = card.dataset.route;
        if (route) window.location.hash = route;
      });
    });

    // Wire up static Top 10 clicks
    container.querySelectorAll('.top10-card').forEach(card => {
      card.addEventListener('click', () => {
        const route = card.dataset.route;
        if (route) window.location.hash = route;
      });
    });

    // ========================================
    // STAGE 2: Progressive Lazy Hydration
    // ========================================
    
    // Lazy hydration helper utilizing IntersectionObserver
    const lazyHydrateRow = (rowId, apiFn, title, iconHtml, defaultMediaType) => {
      const rowContainer = container.querySelector(`#${rowId}`);
      if (!rowContainer) return;

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            observer.disconnect(); // Fire once!
            try {
              const data = await apiFn();
              const mapped = await filterAvailableItems(mapToStandard(data.results, defaultMediaType), defaultMediaType).then(res => res.slice(0, 15));
              
              if (mapped.length > 0) {
                rowContainer.innerHTML = createContentRow(
                  `${iconHtml} ${title}`,
                  mapped,
                  'mixed',
                  null,
                  'portrait',
                  true
                );
                // Hydrate event listeners
                initContentRows(rowContainer);
                if (window.lucide) window.lucide.createIcons();
              } else {
                rowContainer.style.display = 'none'; // collapse shelf if no streams matched
              }
            } catch (err) {
              console.warn(`[LazyLoader] Row failed to load: ${title}`, err);
              rowContainer.style.display = 'none';
            }
          }
        });
      }, { rootMargin: '250px 0px' }); // Trigger when 250px away from viewport

      observer.observe(rowContainer);
      activeObservers.push(observer);
    };

    // Hydrate discovering rows dynamically as they enter the viewport!
    lazyHydrateRow('netflix-row-container', getLatestNetflix, 'Latest from Netflix', '<i data-lucide="tv" class="search-section-icon" style="color:#e50914;"></i>', 'mixed');
    lazyHydrateRow('prime-row-container', getLatestPrime, 'Latest from Prime', '<i data-lucide="film" class="search-section-icon" style="color:#00a8e1;"></i>', 'mixed');
    lazyHydrateRow('cinema-row-container', getCinemaMovies, 'Cinema Hits', '<i data-lucide="film" class="search-section-icon" style="color:#ffae00;"></i>', 'movie');
    lazyHydrateRow('bollywood-row-container', getBollywoodMovies, 'Bollywood', '<i data-lucide="tv" class="search-section-icon" style="color:#a855f7;"></i>', 'movie');
    lazyHydrateRow('south-indian-row-container', getSouthIndianMovies, 'South Indian Action', '<i data-lucide="video" class="search-section-icon" style="color:#00ff88;"></i>', 'movie');
    lazyHydrateRow('horror-row-container', getHorrorMovies, 'Horror Hits', '<i data-lucide="skull" class="search-section-icon" style="color:#a855f7;"></i>', 'movie');
    lazyHydrateRow('romance-row-container', getRomanceMovies, 'Romance & Love', '<i data-lucide="heart" class="search-section-icon" style="color:#ff0055;"></i>', 'movie');
    lazyHydrateRow('scifi-row-container', getSciFiMovies, 'Sci-Fi & Fantasy', '<i data-lucide="orbit" class="search-section-icon" style="color:#00e5ff;"></i>', 'movie');
    lazyHydrateRow('kids-row-container', getKidsMovies, 'Family & Kids', '<i data-lucide="smile" class="search-section-icon" style="color:#ffc107;"></i>', 'movie');
    lazyHydrateRow('comedy-row-container', getComedyMovies, 'Comedy Zone', '<i data-lucide="laugh" class="search-section-icon" style="color:#4caf50;"></i>', 'movie');
    lazyHydrateRow('anime-row-container', getAnimeMovies, 'Anime Chronicles', '<i data-lucide="sparkles" class="search-section-icon" style="color:#ff7600;"></i>', 'movie');

    // Return combined lifecycle cleanup handler
    return () => {
      cleanupHero();
      activeObservers.forEach(obs => obs.disconnect());
      container.removeEventListener('delete-progress', deleteHandler);
    };

  } catch (err) {
    console.error('Home page loader fatal error:', err);
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div class="empty-state-title">Something went wrong</div>
        <div class="empty-state-text">Failed to connect to MovieBox API gateway. Please refresh your browser.</div>
      </div>
    `;
  }
}
