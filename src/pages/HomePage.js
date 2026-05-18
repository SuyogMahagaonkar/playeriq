import { getMovieBoxHome, getLatestNetflix, getLatestPrime, getTop10Movies, getTop10Series } from '../services/api.js';
import { createHeroBanner, initHeroBanner } from '../components/HeroBanner.js';
import { createContentRow, createSkeletonRow, initContentRows } from '../components/ContentRow.js';
import { createMovieCard } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { getWatchHistory, removeFromHistory as removeProgress } from '../services/auth.js';

export async function renderHomePage({ container }) {
  // Show base skeleton for hero
  container.innerHTML = `
    <div style="height:600px;background:var(--bg-secondary);animation:shimmer 2s infinite;background-size:200% 100%;background-image:linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);"></div>
  `;

  try {
    const [homeData, netflixData, primeData, top10MoviesData, top10SeriesData] = await Promise.all([
      getMovieBoxHome(),
      getLatestNetflix().catch(() => ({ results: [] })),
      getLatestPrime().catch(() => ({ results: [] })),
      getTop10Movies().catch(() => ({ results: [] })),
      getTop10Series().catch(() => ({ results: [] }))
    ]);
    
    const items = homeData.items || [];
    
    // Find banner section
    const bannerSection = items.find(i => i.type === 'BANNER' && i.banner?.banners);
    const banners = bannerSection ? bannerSection.banner.banners.filter(b => b.subject) : [];
    
    // Convert banners to TMDB-like structure for the hero banner component
    const heroItems = banners.map(b => ({
      id: `mb_${b.subject.subjectId}`,
      title: b.subject.title,
      name: b.subject.title,
      backdrop_path: b.image?.url || b.subject.cover?.url,
      poster_path: b.subject.cover?.url,
      overview: b.subject.genre || '',
      media_type: b.subject.subjectType === 1 ? 'movie' : 'tv'
    }));

    const heroHTML = createHeroBanner(heroItems);

    // Continue Watching
    const history = await getWatchHistory();
    let continueWatchingHTML = '';
    if (history && history.length > 0) {
      const historyCards = history.map(item => {
        const route = item.type === 'tv' 
          ? `/watch/tv/${item.id}?s=${item.season}&e=${item.episode}` 
          : `/watch/movie/${item.id}`;
        const subtitle = item.type === 'tv' ? `S${item.season} E${item.episode}` : 'Movie';
        return createMovieCard(item, item.type, route, subtitle, item, true, 'portrait');
      }).join('');

      continueWatchingHTML = createContentRow(
        '<i data-lucide="play-circle"></i> Continue Watching', 
        historyCards, 
        'custom'
      );
    }

    // 1. Netflix Row
    const mappedNetflix = (netflixData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: item.media_type
    }));
    let netflixHTML = '';
    if (mappedNetflix.length > 0) {
      netflixHTML = createContentRow(
        `<i data-lucide="tv" class="search-section-icon" style="color:#e50914;"></i> Latest from Netflix`,
        mappedNetflix,
        'mixed',
        null,
        'portrait',
        true
      );
    }

    // 2. Prime Video Row
    const mappedPrime = (primeData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: item.media_type
    }));
    let primeHTML = '';
    if (mappedPrime.length > 0) {
      primeHTML = createContentRow(
        `<i data-lucide="film" class="search-section-icon" style="color:#00a8e1;"></i> Latest from Prime`,
        mappedPrime,
        'mixed',
        null,
        'portrait',
        true
      );
    }

    // 3. Top 10 Movies Row
    let top10MoviesHTML = '';
    const topMovies = top10MoviesData.results || [];
    if (topMovies.length > 0) {
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
            
            <div style="
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

      top10MoviesHTML = `
        <section class="content-row">
          <div class="content-row-header" style="padding-left: 45px;">
            <h2 class="content-row-title"><i data-lucide="trending-up" class="search-section-icon" style="color:#ff0055;"></i> Top 10 Movies Today</h2>
          </div>
          <div class="content-row-scroll-wrapper" style="position: relative;">
            <div class="content-row-cards" style="display: flex; gap: 0px; overflow-x: auto; padding: 20px 20px 20px 45px; scrollbar-width: none; overflow-y: hidden;">
              ${topMoviesCards}
            </div>
          </div>
        </section>
      `;
    }

    // 4. Top 10 Series Row
    let top10SeriesHTML = '';
    const topSeries = top10SeriesData.results || [];
    if (topSeries.length > 0) {
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
            
            <div style="
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

      top10SeriesHTML = `
        <section class="content-row">
          <div class="content-row-header" style="padding-left: 45px;">
            <h2 class="content-row-title"><i data-lucide="trending-up" class="search-section-icon" style="color:#00a8e1;"></i> Top 10 Shows Today</h2>
          </div>
          <div class="content-row-scroll-wrapper" style="position: relative;">
            <div class="content-row-cards" style="display: flex; gap: 0px; overflow-x: auto; padding: 20px 20px 20px 45px; scrollbar-width: none; overflow-y: hidden;">
              ${topSeriesCards}
            </div>
          </div>
        </section>
      `;
    }

    // Extract lists from the home payload, removing Upcoming Calendar and limiting to exactly 5 rows
    const validRows = items.filter(i => {
      const isCorrectType = 
        (i.type === 'SUBJECTS_MOVIE' && i.subjects && i.subjects.length > 0 && i.title) ||
        (i.type === 'CUSTOM' && i.customData?.items && i.customData.items.length > 0 && i.title) ||
        (i.type === 'APPOINTMENT_LIST' && i.subjects && i.subjects.length > 0 && i.title);
      if (!isCorrectType) return false;
      
      const lowerTitle = (i.title || '').toLowerCase();
      if (lowerTitle.includes('upcoming calendar')) return false;
      return true;
    }).slice(0, 5);
    
    let rowsHTML = validRows.map((rowObj, index) => {
      let rawItems = [];
      if (rowObj.type === 'SUBJECTS_MOVIE' || rowObj.type === 'APPOINTMENT_LIST') {
        rawItems = rowObj.subjects;
      } else if (rowObj.type === 'CUSTOM') {
        rawItems = rowObj.customData.items.map(ci => ci.subject).filter(Boolean);
      }

      // Map MovieBox items to our common format
      const mappedItems = rawItems.map(mbItem => ({
        id: `mb_${mbItem.subjectId || mbItem.id}`,
        title: mbItem.title,
        name: mbItem.title,
        poster_path: mbItem.cover?.url || mbItem.cover_url || mbItem.poster_path,
        backdrop_path: mbItem.cover?.url || mbItem.cover_url || mbItem.backdrop_path,
        vote_average: mbItem.imdbRate || mbItem.rating ? parseFloat(mbItem.imdbRate || mbItem.rating) : null,
        release_date: mbItem.releaseDate || mbItem.release_date,
        media_type: mbItem.subjectType === 1 ? 'movie' : 'tv'
      }));

      // Only first 3 rows load immediately, rest are handled by intersection observer (or just render all since data is already fetched!)
      // Since we already have the data, we can just render them directly.
      const icon = index % 2 === 0 ? 'film' : 'tv';
      return createContentRow(`<i data-lucide="${icon}" class="search-section-icon"></i> ${rowObj.title}`, mappedItems, 'mixed', null, 'portrait');
    }).join('');

    container.innerHTML = heroHTML + continueWatchingHTML + netflixHTML + primeHTML + top10MoviesHTML + top10SeriesHTML + `<div id="home-rows-container">${rowsHTML}</div>` + createFooter();

    // Inject outline top 10 style
    const top10Style = document.createElement('style');
    top10Style.innerHTML = `
      .top10-card:hover .top10-number {
        -webkit-text-stroke: 4px #ff0055 !important;
        color: rgba(255, 0, 85, 0.1) !important;
        filter: drop-shadow(0 0 15px rgba(255, 0, 85, 0.6)) !important;
      }
    `;
    container.appendChild(top10Style);

    // Initialize interactivity
    const cleanupHero = initHeroBanner();
    initContentRows(container);
    if (window.lucide) window.lucide.createIcons();

    // Wire up Top 10 clicks
    container.querySelectorAll('.top10-card').forEach(card => {
      card.addEventListener('click', () => {
        const route = card.dataset.route;
        if (route) window.location.hash = route;
      });
    });

    // Handle delete events for Continue Watching
    const deleteHandler = (e) => {
      const id = e.detail.id;
      if (id) {
        removeProgress(id);
        container.removeEventListener('delete-progress', deleteHandler);
        renderHomePage({ container });
      }
    };
    container.addEventListener('delete-progress', deleteHandler);

    return () => {
      cleanupHero();
      container.removeEventListener('delete-progress', deleteHandler);
    };

  } catch (err) {
    console.error('Home page error:', err);
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div class="empty-state-title">Something went wrong</div>
        <div class="empty-state-text">Failed to load content from MovieBox. Please check your connection and try again.</div>
      </div>
    `;
  }
}
