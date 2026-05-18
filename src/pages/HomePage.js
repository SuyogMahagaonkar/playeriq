import { getMovieBoxHome, getLatestNetflix, getLatestPrime } from '../services/api.js';
import { createHeroBanner, initHeroBanner } from '../components/HeroBanner.js';
import { createContentRow, createSkeletonRow, initContentRows } from '../components/ContentRow.js';
import { createMovieCard } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { getProgress, removeProgress } from '../services/storage.js';

export async function renderHomePage({ container }) {
  // Show base skeleton for hero
  container.innerHTML = `
    <div style="height:600px;background:var(--bg-secondary);animation:shimmer 2s infinite;background-size:200% 100%;background-image:linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);"></div>
  `;

  try {
    const [homeData, netflixData, primeData] = await Promise.all([
      getMovieBoxHome(),
      getLatestNetflix().catch(() => ({ results: [] })),
      getLatestPrime().catch(() => ({ results: [] }))
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
    const history = getProgress();
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
        'portrait'
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
        'portrait'
      );
    }

    // Extract lists from the home payload
    const validRows = items.filter(i => 
      (i.type === 'SUBJECTS_MOVIE' && i.subjects && i.subjects.length > 0 && i.title) ||
      (i.type === 'CUSTOM' && i.customData?.items && i.customData.items.length > 0 && i.title) ||
      (i.type === 'APPOINTMENT_LIST' && i.subjects && i.subjects.length > 0 && i.title)
    );
    
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

    container.innerHTML = heroHTML + continueWatchingHTML + netflixHTML + primeHTML + `<div id="home-rows-container">${rowsHTML}</div>` + createFooter();

    // Initialize interactivity
    const cleanupHero = initHeroBanner();
    initContentRows(container);
    if (window.lucide) window.lucide.createIcons();

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
