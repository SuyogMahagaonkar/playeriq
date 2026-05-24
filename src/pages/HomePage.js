import { getMovieBoxHome, getLatestNetflix, getLatestPrime, getTop10Movies, getTop10Series, getMediaImages } from '../services/api.js';
import { createHeroBanner, initHeroBanner } from '../components/HeroBanner.js';
import { createContentRow, createSkeletonRow, initContentRows } from '../components/ContentRow.js';
import { createMovieCard } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { getWatchHistory, removeFromHistory as removeProgress } from '../services/auth.js';

export async function renderHomePage({ container }) {
  if (window.innerWidth <= 767) {
    container.innerHTML = `
      <div class="skeleton-page">
        <div class="skeleton-hero">
          <div class="skeleton-hero-badge"></div>
          <div class="skeleton-hero-title"></div>
          <div class="skeleton-hero-meta"></div>
          <div class="skeleton-hero-overview"></div>
          <div class="skeleton-hero-actions">
            <div class="skeleton-hero-btn"></div>
            <div class="skeleton-hero-btn"></div>
          </div>
        </div>
        <div class="skeleton-row-container">
          ${createSkeletonRow('Latest from Netflix', '', 'portrait')}
          ${createSkeletonRow('Latest from Prime Video', '', 'portrait')}
          ${createSkeletonRow('Trending Movies', '', 'landscape')}
        </div>
      </div>
    `;
  } else {
    // Show base skeleton for hero
    container.innerHTML = `
      <div style="height:600px;background:var(--bg-secondary);animation:shimmer 2s infinite;background-size:200% 100%;background-image:linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);"></div>
    `;
  }

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
    const addedTitles = new Set();
    const finalHeroItemsBase = [];
    
    const trendingItemsBase = banners.map(b => ({
      id: `mb_${b.subject.subjectId}`,
      title: b.subject.title,
      name: b.subject.title,
      backdrop_path: b.image?.url || b.subject.cover?.url,
      poster_path: b.subject.cover?.url,
      overview: b.subject.genre || '',
      media_type: b.subject.subjectType === 1 ? 'movie' : 'tv'
    }));

    // Check if a candidate title is a duplicate of any already added titles (handles suffix brackets and substring overlaps!)
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

    // Add up to 6 unique trending items from banners
    for (const item of trendingItemsBase) {
      if (finalHeroItemsBase.length >= 6) break;
      if (!isDuplicateTitle(item.title)) {
        const cleanNorm = item.title.replace(/\[.*?\]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        addedTitles.add(cleanNorm);
        finalHeroItemsBase.push(item);
      }
    }

    // Mix in 4 unique items from Netflix & Prime Video
    const netflixItems = (netflixData.results || []).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      backdrop_path: item.backdrop_path,
      poster_path: item.poster_path,
      overview: item.overview || '',
      media_type: item.media_type || 'movie'
    }));

    const primeItems = (primeData.results || []).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      backdrop_path: item.backdrop_path,
      poster_path: item.poster_path,
      overview: item.overview || '',
      media_type: item.media_type || 'movie'
    }));

    let netflixIdx = 0;
    let primeIdx = 0;
    let turn = 0; // 0 for Netflix, 1 for Prime
    const totalExtraNeeded = 4;
    let extraAdded = 0;

    while (extraAdded < totalExtraNeeded && (netflixIdx < netflixItems.length || primeIdx < primeItems.length)) {
      let candidate = null;
      if (turn === 0 && netflixIdx < netflixItems.length) {
        candidate = netflixItems[netflixIdx++];
        turn = 1; // switch turn
      } else if (turn === 1 && primeIdx < primeItems.length) {
        candidate = primeItems[primeIdx++];
        turn = 0; // switch turn
      } else if (netflixIdx < netflixItems.length) {
        candidate = netflixItems[netflixIdx++];
      } else if (primeIdx < primeItems.length) {
        candidate = primeItems[primeIdx++];
      }

      if (candidate && candidate.backdrop_path) {
        if (!isDuplicateTitle(candidate.title)) {
          const cleanNorm = candidate.title.replace(/\[.*?\]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
          addedTitles.add(cleanNorm);
          finalHeroItemsBase.push(candidate);
          extraAdded++;
        }
      }
    }

    // Fetch TMDB images and details in parallel for the hero banner items!
    const heroItems = await Promise.all(finalHeroItemsBase.map(async (item) => {
      try {
        const cleanTitle = item.title.replace(/\[.*?\]/g, '').trim();
        const searchRes = await fetch(`https://api.themoviedb.org/3/search/${item.media_type}?api_key=8e4ad9e56e31ab079517b5be6965b477&query=${encodeURIComponent(cleanTitle)}`);
        
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const tmdbMatch = searchData.results?.[0];
          
          if (tmdbMatch) {
            // Fetch images collection using the matched TMDB ID
            const imagesRes = await fetch(`https://api.themoviedb.org/3/${item.media_type}/${tmdbMatch.id}/images?api_key=8e4ad9e56e31ab079517b5be6965b477&include_image_language=en,hi,null`);
            const imagesData = imagesRes.ok ? await imagesRes.json() : null;
            
            // Merge TMDB metadata (vote_average, release_date/first_air_date, overview, backdrop, poster)
            return {
              ...item,
              vote_average: tmdbMatch.vote_average || item.vote_average,
              release_date: tmdbMatch.release_date || tmdbMatch.first_air_date || item.release_date,
              first_air_date: tmdbMatch.first_air_date || tmdbMatch.release_date || item.first_air_date,
              overview: tmdbMatch.overview || item.overview,
              backdrop_path: tmdbMatch.backdrop_path || item.backdrop_path,
              poster_path: tmdbMatch.poster_path || item.poster_path,
              images: imagesData
            };
          }
        }
      } catch (e) {
        console.warn('Failed to load TMDB details for hero item', item.title, e);
      }
      return item;
    }));

    const heroHTML = createHeroBanner(heroItems);

    // Continue Watching
    const history = await getWatchHistory();
    const continueWatchingItems = history.filter(item => {
      if (item.watched) return false;
      if (item.duration > 0 && (item.duration - item.currentTime <= 300)) return false;
      return true;
    });

    let continueWatchingHTML = '';
    if (continueWatchingItems && continueWatchingItems.length > 0) {
      const historyCards = continueWatchingItems.map(item => {
        const route = item.type === 'tv' 
          ? `/watch/tv/${item.id}?s=${item.season}&e=${item.episode}` 
          : `/watch/movie/${item.id}`;
        const subtitle = item.type === 'tv' ? `S${item.season} E${item.episode}` : 'Movie';
        return createMovieCard(item, item.type, route, subtitle, item, true, 'landscape');
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

      top10MoviesHTML = `
        <section class="content-row top10-movies-section">
          <div class="content-row-header" style="padding-left: 45px; display: flex; justify-content: space-between; align-items: center;">
            <h2 class="content-row-title"><i data-lucide="trending-up" class="search-section-icon" style="color:#ff0055;"></i> Top 10 Movies Today</h2>
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

      top10SeriesHTML = `
        <section class="content-row top10-shows-section">
          <div class="content-row-header" style="padding-left: 45px; display: flex; justify-content: space-between; align-items: center;">
            <h2 class="content-row-title"><i data-lucide="trending-up" class="search-section-icon" style="color:#00a8e1;"></i> Top 10 Shows Today</h2>
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
      const icon = index % 2 === 0 ? 'film' : 'tv';
      return createContentRow(`<i data-lucide="${icon}" class="search-section-icon"></i> ${rowObj.title}`, mappedItems, 'mixed', null, 'portrait');
    }).join('');

    const top10ToggleHTML = `
      <div class="top10-mobile-toggle" style="display: none;">
        <div class="top10-toggle-pills">
          <button class="top10-toggle-pill active" data-target="movies">Movies</button>
          <button class="top10-toggle-pill" data-target="shows">Shows</button>
        </div>
        <a href="#/ranking" class="top10-mobile-see-all">See All <i data-lucide="chevron-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></a>
      </div>
    `;

    container.innerHTML = heroHTML + continueWatchingHTML + netflixHTML + primeHTML + top10ToggleHTML + top10MoviesHTML + top10SeriesHTML + `<div id="home-rows-container">${rowsHTML}</div>` + createFooter();

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

    // Wire up Top 10 Mobile Toggle
    const togglePills = container.querySelectorAll('.top10-toggle-pill');
    if (togglePills.length > 0) {
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

      // Default initial state for mobile view: show movies, hide shows
      if (window.innerWidth <= 768) {
        if (moviesSection) moviesSection.style.setProperty('display', 'block', 'important');
        if (showsSection) showsSection.style.setProperty('display', 'none', 'important');
      }
    }

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
