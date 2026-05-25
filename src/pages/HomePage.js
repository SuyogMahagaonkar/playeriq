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
  getAnimeMovies
} from '../services/api.js';
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
    const [
      trendingAllData, 
      netflixData, 
      primeData, 
      top10MoviesData, 
      top10SeriesData, 
      bollywoodData, 
      southIndianData, 
      cinemaData,
      horrorData,
      romanceData,
      scifiData,
      kidsData,
      comedyData,
      animeData
    ] = await Promise.all([
      getTrendingAll().catch(() => ({ results: [] })),
      getLatestNetflix().catch(() => ({ results: [] })),
      getLatestPrime().catch(() => ({ results: [] })),
      getTop10Movies().catch(() => ({ results: [] })),
      getTop10Series().catch(() => ({ results: [] })),
      getBollywoodMovies().catch(() => ({ results: [] })),
      getSouthIndianMovies().catch(() => ({ results: [] })),
      getCinemaMovies().catch(() => ({ results: [] })),
      getHorrorMovies().catch(() => ({ results: [] })),
      getRomanceMovies().catch(() => ({ results: [] })),
      getSciFiMovies().catch(() => ({ results: [] })),
      getKidsMovies().catch(() => ({ results: [] })),
      getComedyMovies().catch(() => ({ results: [] })),
      getAnimeMovies().catch(() => ({ results: [] }))
    ]);
    
    // Find banner section (using top trending blockbusters of the week from TMDB!)
    const banners = (trendingAllData.results || []).slice(0, 10);
    
    // Convert banners to TMDB-like structure for the hero banner component
    const addedTitles = new Set();
    const finalHeroItemsBase = [];
    
    const trendingItemsBase = banners.map(b => ({
      id: b.id,
      title: b.title || b.name,
      name: b.title || b.name,
      backdrop_path: b.backdrop_path,
      poster_path: b.poster_path,
      overview: b.overview || '',
      media_type: b.media_type || 'movie'
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
        const cleanTitle = item.title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
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
    const getMillis = (timestamp) => {
      if (!timestamp) return 0;
      if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
      if (typeof timestamp === 'number') return timestamp;
      if (timestamp instanceof Date) return timestamp.getTime();
      const parsed = Date.parse(timestamp);
      return isNaN(parsed) ? 0 : parsed;
    };

    const history = await getWatchHistory();
    let continueWatchingItems = history.filter(item => {
      if (item.watched) return false;
      const pct = item.duration > 0 ? (item.currentTime / item.duration) : 0;
      if (item.duration > 0 && (pct >= 0.90 || (item.duration - item.currentTime <= 300))) return false;
      return true;
    });

    const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
    if (isSafe) {
      continueWatchingItems = continueWatchingItems.filter(isSafeItem);
    }

    // Collapse multiple episodes of the same show into exactly one card (latest active episode)
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

    // Sort final list chronologically (most recently watched first)
    finalContinueWatching.sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));
    continueWatchingItems = finalContinueWatching;

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

    // 5. Cinema Row
    const mappedCinema = (cinemaData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let cinemaHTML = '';
    if (mappedCinema.length > 0) {
      cinemaHTML = createContentRow(
        `<i data-lucide="film" class="search-section-icon" style="color:#ffae00;"></i> 🔥 Cinema`,
        mappedCinema,
        'mixed',
        null,
        'portrait'
      );
    }

    // 6. Bollywood Row
    const mappedBollywood = (bollywoodData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let bollywoodHTML = '';
    if (mappedBollywood.length > 0) {
      bollywoodHTML = createContentRow(
        `<i data-lucide="tv" class="search-section-icon" style="color:#a855f7;"></i> Bollywood`,
        mappedBollywood,
        'mixed',
        null,
        'portrait'
      );
    }

    // 7. South Indian Row
    const mappedSouthIndian = (southIndianData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let southIndianHTML = '';
    if (mappedSouthIndian.length > 0) {
      southIndianHTML = createContentRow(
        `<i data-lucide="video" class="search-section-icon" style="color:#00ff88;"></i> South Indian`,
        mappedSouthIndian,
        'mixed',
        null,
        'portrait'
      );
    }

    // 8. Studios Brand Carousel HTML
    const studiosHTML = `
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
              <img class="studio-logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Disney%2B_logo.svg/512px-Disney%2B_logo.svg.png" alt="Disney+" />
            </div>
            <div class="studio-card studio-hbo" data-route="/category?title=HBO%20Max">
              <img class="studio-logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/HBO_Max_Logo.svg/512px-HBO_Max_Logo.svg.png" alt="HBO Max" />
            </div>
            <div class="studio-card studio-netflix" data-route="/category?title=Netflix">
              <img class="studio-logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/512px-Netflix_2015_logo.svg.png" alt="Netflix" />
            </div>
            <div class="studio-card studio-prime" data-route="/category?title=Amazon%20Prime%20Video">
              <img class="studio-logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Amazon_Prime_Video_logo.svg/512px-Amazon_Prime_Video_logo.svg.png" alt="Prime Video" />
            </div>
            <div class="studio-card studio-paramount" data-route="/category?title=Paramount%2B">
              <img class="studio-logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Paramount%2B_logo.svg/512px-Paramount%2B_logo.svg.png" alt="Paramount+" />
            </div>
            <div class="studio-card studio-marvel" data-route="/category?title=Marvel">
              <img class="studio-logo" src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Marvel-Studios_Logo.svg/512px-Marvel-Studios_Logo.svg.png" alt="Marvel" />
            </div>
          </div>
          <button class="content-row-arrow content-row-arrow-right" aria-label="Scroll right">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </section>
    `;

    // 9. Horror Row
    const mappedHorror = (horrorData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let horrorHTML = '';
    if (mappedHorror.length > 0) {
      horrorHTML = createContentRow(
        `<i data-lucide="skull" class="search-section-icon" style="color:#a855f7;"></i> Horror Hits`,
        mappedHorror,
        'mixed',
        null,
        'portrait'
      );
    }

    // 10. Romance Row
    const mappedRomance = (romanceData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let romanceHTML = '';
    if (mappedRomance.length > 0) {
      romanceHTML = createContentRow(
        `<i data-lucide="heart" class="search-section-icon" style="color:#ff0055;"></i> Romance & Love`,
        mappedRomance,
        'mixed',
        null,
        'portrait'
      );
    }

    // 11. Sci-Fi Row
    const mappedSciFi = (scifiData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let scifiHTML = '';
    if (mappedSciFi.length > 0) {
      scifiHTML = createContentRow(
        `<i data-lucide="orbit" class="search-section-icon" style="color:#00e5ff;"></i> Sci-Fi & Fantasy`,
        mappedSciFi,
        'mixed',
        null,
        'portrait'
      );
    }

    // 12. Kids Row
    const mappedKids = (kidsData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let kidsHTML = '';
    if (mappedKids.length > 0) {
      kidsHTML = createContentRow(
        `<i data-lucide="smile" class="search-section-icon" style="color:#ffc107;"></i> Family & Kids`,
        mappedKids,
        'mixed',
        null,
        'portrait'
      );
    }

    // 13. Comedy Row
    const mappedComedy = (comedyData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let comedyHTML = '';
    if (mappedComedy.length > 0) {
      comedyHTML = createContentRow(
        `<i data-lucide="laugh" class="search-section-icon" style="color:#4caf50;"></i> Comedy Zone`,
        mappedComedy,
        'mixed',
        null,
        'portrait'
      );
    }

    // 14. Anime Row
    const mappedAnime = (animeData.results || []).slice(0, 15).map(item => ({
      id: item.id,
      title: item.title || item.name,
      name: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date,
      media_type: 'movie'
    }));
    let animeHTML = '';
    if (mappedAnime.length > 0) {
      animeHTML = createContentRow(
        `<i data-lucide="sparkles" class="search-section-icon" style="color:#ff7600;"></i> Anime Chronicles`,
        mappedAnime,
        'mixed',
        null,
        'portrait'
      );
    }

    const top10ToggleHTML = `
      <div class="top10-mobile-toggle" style="display: none;">
        <div class="top10-toggle-pills">
          <button class="top10-toggle-pill active" data-target="movies">Movies</button>
          <button class="top10-toggle-pill" data-target="shows">Shows</button>
        </div>
        <a href="#/ranking" class="top10-mobile-see-all">See All <i data-lucide="chevron-right" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></a>
      </div>
    `;

    // Assembly including Featured Studios brand cards row, original shelves, and newly added TMDB genre carousels!
    container.innerHTML = heroHTML + continueWatchingHTML + studiosHTML + cinemaHTML + bollywoodHTML + southIndianHTML + netflixHTML + primeHTML + horrorHTML + romanceHTML + scifiHTML + kidsHTML + comedyHTML + animeHTML + top10ToggleHTML + top10MoviesHTML + top10SeriesHTML + createFooter();

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

    // Wire up Studio clicks
    container.querySelectorAll('.studio-card').forEach(card => {
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
