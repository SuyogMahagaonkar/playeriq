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
  img
} from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { getUser } from '../services/auth.js';
import { isInWatchlist, addToWatchlist, removeFromWatchlist } from '../services/firebase.js';

let allItems = [];
let filteredItems = [];
let currentPage = 1;
let tmdbPage = 1;
const ITEMS_PER_PAGE = 21;

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
  const isDC = (cleanTitle.includes('dc') && !cleanTitle.includes('dice') && !cleanTitle.includes('decade')) || lowerTitle.includes('dc studios');
  const isWarnerBros = cleanTitle.includes('warner') || lowerTitle.includes('warner');
  const isUniversal = cleanTitle.includes('universal') || lowerTitle.includes('universal');
  const isSony = cleanTitle.includes('sony') || lowerTitle.includes('sony');
  const isAppleTV = cleanTitle.includes('apple') || lowerTitle.includes('apple');
  const isDreamWorks = cleanTitle.includes('dreamworks') || lowerTitle.includes('dreamworks');

  const isLiveProvider = isNetflix || isPrime || isHorror || isRomance || isSciFi || isKids || isComedy || isAnime || isDisney || isHbo || isParamount || isMarvel || isDC || isWarnerBros || isUniversal || isSony || isAppleTV || isDreamWorks;

  console.log(`[CategoryPage] Diagnostic: categoryTitle="${categoryTitle}", cleanTitle="${cleanTitle}", isDisney=${isDisney}, isPrime=${isPrime}, isLiveProvider=${isLiveProvider}`);

  // Premium dynamic theme configurations based on the catalog type
  let bannerBg = 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
  let accentColor = '#a855f7';
  let shadowColor = 'rgba(168, 85, 247, 0.3)';
  let brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(168, 85, 247, 0.18); border: 1px solid rgba(168, 85, 247, 0.45); color: #a855f7;">Premium Selection</span>`;
  let bannerIcon = '🍿';

  if (isNetflix) {
    bannerBg = 'linear-gradient(135deg, rgba(229, 9, 20, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#e50914';
    shadowColor = 'rgba(229, 9, 20, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(229, 9, 20, 0.18); border: 1px solid rgba(229, 9, 20, 0.45); color: #e50914;">Netflix Originals</span>`;
    bannerIcon = '🎬';
  } else if (isPrime) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 168, 225, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#00a8e1';
    shadowColor = 'rgba(0, 168, 225, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(0, 168, 225, 0.18); border: 1px solid rgba(0, 168, 225, 0.45); color: #00a8e1;">Amazon Prime Video</span>`;
    bannerIcon = '💙';
  } else if (isDisney) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 102, 204, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#1a6fbf';
    shadowColor = 'rgba(0, 102, 204, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(0, 102, 204, 0.18); border: 1px solid rgba(0, 102, 204, 0.45); color: #4da6ff;">✨ Disney Originals</span>`;
    bannerIcon = '✨';
  } else if (isHbo) {
    bannerBg = 'linear-gradient(135deg, rgba(153, 51, 255, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#9933ff';
    shadowColor = 'rgba(153, 51, 255, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(153, 51, 255, 0.18); border: 1px solid rgba(153, 51, 255, 0.45); color: #9933ff;">HBO Max Originals</span>`;
    bannerIcon = '👑';
  } else if (isParamount) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 102, 255, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#0066ff';
    shadowColor = 'rgba(0, 102, 255, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(0, 102, 255, 0.18); border: 1px solid rgba(0, 102, 255, 0.45); color: #0066ff;">Paramount+ Original</span>`;
    bannerIcon = '🏔️';
  } else if (isMarvel) {
    bannerBg = 'linear-gradient(135deg, rgba(237, 29, 36, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#ed1d24';
    shadowColor = 'rgba(237, 29, 36, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(237, 29, 36, 0.18); border: 1px solid rgba(237, 29, 36, 0.45); color: #ed1d24;">Marvel Studios</span>`;
    bannerIcon = '🛡️';
  } else if (isHorror) {
    bannerIcon = '👻';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.45); color: #ef4444;">Horror & Thriller</span>`;
    accentColor = '#ef4444';
    shadowColor = 'rgba(239, 68, 68, 0.3)';
  } else if (isRomance) {
    bannerIcon = '💖';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(236, 72, 153, 0.18); border: 1px solid rgba(236, 72, 153, 0.45); color: #ec4899;">Romance Selection</span>`;
    accentColor = '#ec4899';
    shadowColor = 'rgba(236, 72, 153, 0.3)';
  } else if (isSciFi) {
    bannerIcon = '🚀';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.45); color: #10b981;">Sci-Fi & Fantasy</span>`;
    accentColor = '#10b981';
    shadowColor = 'rgba(16, 185, 129, 0.3)';
  } else if (isComedy) {
    bannerIcon = '😂';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(245, 158, 11, 0.18); border: 1px solid rgba(245, 158, 11, 0.45); color: #f59e0b;">Comedy Catalog</span>`;
    accentColor = '#f59e0b';
    shadowColor = 'rgba(245, 158, 11, 0.3)';
  } else if (isAnime) {
    bannerIcon = '🌸';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(251, 113, 133, 0.18); border: 1px solid rgba(251, 113, 133, 0.45); color: #fb7185;">Anime Classics</span>`;
    accentColor = '#fb7185';
    shadowColor = 'rgba(251, 113, 133, 0.3)';
  } else if (isDC) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 75, 200, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#004bc8';
    shadowColor = 'rgba(0, 75, 200, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(0, 75, 200, 0.18); border: 1px solid rgba(0, 75, 200, 0.45); color: #4da6ff;">DC Universe</span>`;
    bannerIcon = '🦇';
  } else if (isWarnerBros) {
    bannerBg = 'linear-gradient(135deg, rgba(200, 160, 0, 0.22) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#c8a000';
    shadowColor = 'rgba(200, 160, 0, 0.35)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(200, 160, 0, 0.18); border: 1px solid rgba(200, 160, 0, 0.45); color: #f5d060;">Warner Bros.</span>`;
    bannerIcon = '🎬';
  } else if (isUniversal) {
    bannerBg = 'linear-gradient(135deg, rgba(200, 160, 0, 0.2) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#d4a017';
    shadowColor = 'rgba(212, 160, 23, 0.3)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(212, 160, 23, 0.18); border: 1px solid rgba(212, 160, 23, 0.45); color: #f5c842;">Universal Pictures</span>`;
    bannerIcon = '🌍';
  } else if (isSony) {
    bannerBg = 'linear-gradient(135deg, rgba(180, 180, 220, 0.15) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#b4b4dc';
    shadowColor = 'rgba(180, 180, 220, 0.3)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(180, 180, 220, 0.18); border: 1px solid rgba(180, 180, 220, 0.45); color: #c8c8f0;">Sony Pictures</span>`;
    bannerIcon = '🎥';
  } else if (isAppleTV) {
    bannerBg = 'linear-gradient(135deg, rgba(160, 160, 180, 0.15) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#a0a0b4';
    shadowColor = 'rgba(160, 160, 180, 0.25)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(160, 160, 180, 0.18); border: 1px solid rgba(160, 160, 180, 0.45); color: #dcdce8;">Apple Originals</span>`;
    bannerIcon = '🍎';
  } else if (isDreamWorks) {
    bannerBg = 'linear-gradient(135deg, rgba(0, 140, 200, 0.2) 0%, rgba(10, 10, 15, 0.75) 50%, rgba(5, 5, 8, 0.95) 100%)';
    accentColor = '#008cc8';
    shadowColor = 'rgba(0, 140, 200, 0.3)';
    brandBadge = `<span class="category-hero-brand-badge" style="background: rgba(0, 140, 200, 0.18); border: 1px solid rgba(0, 140, 200, 0.45); color: #40c0f0;">DreamWorks Animation</span>`;
    bannerIcon = '🌙';
  }

  // Pre-determine brand room logo for instantaneous rendering
  let initialLogoHtml = '';
  if (isHbo) {
    initialLogoHtml = `<img src="https://image.tmdb.org/t/p/original/tuomPhY2UtuPTqqFnKMVHvSb724.png" alt="HBO Max" style="filter: brightness(0) invert(1); max-height: 70px; object-fit: contain;" />`;
  } else if (isDisney) {
    initialLogoHtml = `<img src="https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg" alt="Disney+" style="filter: brightness(0) invert(1); max-height: 80px; object-fit: contain;" />`;
  } else if (isNetflix) {
    initialLogoHtml = `<img src="https://www.vectorlogo.zone/logos/netflix/netflix-ar21.svg" alt="Netflix" style="filter: brightness(0) invert(1); max-height: 60px; object-fit: contain;" />`;
  } else if (isPrime) {
    initialLogoHtml = `<img src="https://image.tmdb.org/t/p/original/f311cuuS7HK38HYgcYl0rXQrKvv.png" alt="Amazon Prime Video" style="filter: brightness(0) invert(1); max-height: 70px; object-fit: contain;" />`;
  } else if (isParamount) {
    initialLogoHtml = `<img src="https://image.tmdb.org/t/p/original/jay6WcMgagAklUt7i9Euwj1pzTF.png" alt="Paramount+" style="filter: brightness(0) invert(1); max-height: 80px; object-fit: contain;" />`;
  } else if (isMarvel) {
    initialLogoHtml = `<img class="category-hero-logo-marvel" src="/marvel-logo-white.svg" alt="Marvel Studios" style="max-height: 60px; object-fit: contain;" />`;
  } else if (isDC) {
    initialLogoHtml = `<img src="/dc-logo-white.svg" alt="DC Studios" style="max-height: 80px; object-fit: contain;" />`;
  } else if (isWarnerBros) {
    initialLogoHtml = `<img src="/wb-logo-white.svg" alt="Warner Bros" style="max-height: 70px; object-fit: contain;" />`;
  } else if (isUniversal) {
    initialLogoHtml = `<img src="/universal-logo-white.svg" alt="Universal Pictures" style="max-height: 70px; object-fit: contain;" />`;
  } else if (isSony) {
    initialLogoHtml = `<img src="/sony-logo-white.svg" alt="Sony Pictures" style="max-height: 70px; object-fit: contain;" />`;
  } else if (isAppleTV) {
    initialLogoHtml = `<img src="/appletv-logo-white.svg" alt="Apple TV+" style="max-height: 70px; object-fit: contain;" />`;
  } else if (isDreamWorks) {
    initialLogoHtml = `<img src="/dreamworks-logo-white.svg" alt="DreamWorks" style="max-height: 70px; object-fit: contain;" />`;
  }

  const roomTitleHtml = initialLogoHtml 
    ? initialLogoHtml 
    : `<span class="category-brand-room-icon">${bannerIcon}</span><span class="category-brand-room-text-title">${categoryTitle}</span>`;

  container.innerHTML = `
    <div class="movie-grid-page animate-fade-in">
      <!-- Glassmorphic Brand Room Header (Logo Only, No Badge Text) -->
      <div class="category-brand-room-header" style="--shadowColor: ${shadowColor}; --accent: ${accentColor}; padding: 25px var(--space-xl);">
        <div class="category-brand-room-left" style="justify-content: center; width: 100%;">
          ${roomTitleHtml}
        </div>
      </div>

      <!-- Widescreen Cinematic Hero Billboard (Dual-Tier Row 2) -->
      <div id="category-hero-container">
        <!-- Render a skeletal shimmering hero billboard initially -->
        <div class="category-hero-billboard shimmer-bg" style="display: flex; flex-direction: column; justify-content: flex-end; padding: 45px var(--space-xl); height: 480px; position: relative;">
          <div style="width: 250px; height: 40px; background: rgba(255,255,255,0.06); border-radius: 4px; margin-bottom: 20px;"></div>
          <div style="width: 180px; height: 20px; background: rgba(255,255,255,0.04); border-radius: 4px; margin-bottom: 15px;"></div>
          <div style="width: 90%; max-width: 500px; height: 60px; background: rgba(255,255,255,0.04); border-radius: 4px; margin-bottom: 25px;"></div>
          <div style="display: flex; gap: 12px;">
            <div style="width: 140px; height: 44px; background: rgba(255,255,255,0.06); border-radius: 30px;"></div>
            <div style="width: 160px; height: 44px; background: rgba(255,255,255,0.06); border-radius: 30px;"></div>
          </div>
        </div>
      </div>

      <div class="category-search-pill-container" style="--shadowColor: ${shadowColor}; --accent: ${accentColor};">
        <div class="category-results-count" id="category-results-count">Loading titles...</div>
        <div class="category-search-pill-wrapper">
          <input type="text" id="category-search-input" class="category-search-pill" placeholder="Search within ${categoryTitle}..." />
          <svg class="category-search-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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

  // Helper method to dynamically update the Cinematic Hero Spotlight
  const updateHeroBillboard = async (heroItem) => {
    const heroContainer = container.querySelector('#category-hero-container');
    if (!heroContainer) return;

    if (!heroItem) {
      heroContainer.innerHTML = `
        <div class="category-hero-billboard" style="background: ${bannerBg};">
          <div class="category-hero-mask"></div>
          <div class="category-hero-content">
            <span class="category-hero-brand-badge" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #ffffff;">🔥 FEATURED SPOTLIGHT</span>
            <h1 class="category-hero-title">${categoryTitle} Selection</h1>
            <p class="category-hero-synopsis">
              Explore our premium curated collection of blockbusters, series, and handpicked favorites within <strong>${categoryTitle}</strong>.
            </p>
          </div>
        </div>
      `;
      return;
    }

    const backdropUrl = heroItem.backdrop_path ? img.backdrop(heroItem.backdrop_path, 'original') : '';
    const posterUrl = heroItem.poster_path ? img.poster(heroItem.poster_path, 'w780') : '';

    const releaseYear = (heroItem.release_date || '').slice(0, 4) || new Date().getFullYear();
    const mediaTypeLabel = (heroItem.media_type || 'movie').toUpperCase() === 'TV' ? 'TV Show' : 'Movie';
    const voteAverage = heroItem.vote_average ? parseFloat(heroItem.vote_average).toFixed(1) : 'N/A';

    let synopsisText = heroItem.overview || '';
    if (!synopsisText) {
      synopsisText = `Experience the incredible release of ${heroItem.title || heroItem.name}, now streaming in high fidelity on PlayerIQ's premium ${categoryTitle} hub.`;
    }

    // Fetch transparent logo from TMDB images endpoint
    const tmdbId = heroItem.id && !String(heroItem.id).startsWith('mb_') ? heroItem.id : null;
    let heroLogoHtml = '';
    if (tmdbId) {
      try {
        const mediaTypeForImg = (heroItem.media_type === 'tv') ? 'tv' : 'movie';
        const imgRes = await fetch(`https://api.themoviedb.org/3/${mediaTypeForImg}/${tmdbId}/images?api_key=8e4ad9e56e31ab079517b5be6965b477&include_image_language=en,null`);
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const logos = (imgData.logos || []).filter(l => l.file_path && (l.file_path.endsWith('.png') || l.file_path.endsWith('.svg')));
          const bestLogo = logos.find(l => l.iso_639_1 === 'en') || logos[0];
          if (bestLogo) {
            heroLogoHtml = `<img class="category-hero-movie-logo" src="https://image.tmdb.org/t/p/w500${bestLogo.file_path}" alt="${heroItem.title || heroItem.name}" />`;
          }
        }
      } catch (_) { /* silent fallback to text title */ }
    }

    const heroTitleBlock = heroLogoHtml
      ? heroLogoHtml
      : `<h1 class="category-hero-title">${heroItem.title || heroItem.name}</h1>`;

    heroContainer.innerHTML = `
      <div class="category-hero-billboard" style="background-image: url('${backdropUrl || posterUrl}');">
        <div class="category-hero-mask"></div>
        <div class="category-hero-content">
          ${heroTitleBlock}
          
          <div class="category-hero-metadata">
            <span class="category-hero-rating">★ ${voteAverage}</span>
            <span class="category-hero-year">${releaseYear}</span>
            <span class="category-hero-media-type">${mediaTypeLabel}</span>
          </div>

          <p class="category-hero-synopsis">${synopsisText}</p>

          <div class="category-hero-actions">
            <button class="category-hero-btn category-hero-btn-primary" id="hero-watch-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;"><path d="M8 5v14l11-7z"/></svg> Play Now
            </button>
            <button class="category-hero-btn category-hero-btn-secondary" id="hero-info-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> More Info
            </button>
            <button class="category-hero-btn category-hero-btn-secondary" id="hero-watchlist-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Watchlist
            </button>
          </div>
        </div>
      </div>
    `;

    // Action clicks
    const watchBtn = heroContainer.querySelector('#hero-watch-btn');
    const infoBtn = heroContainer.querySelector('#hero-info-btn');
    const watchlistBtn = heroContainer.querySelector('#hero-watchlist-btn');

    const itemRouteType = heroItem.media_type || 'movie';
    const itemId = heroItem.id;
    const playRoute = `#/watch/${itemRouteType}/${itemId}`;
    const infoRoute = `#/${itemRouteType}/${itemId}`;

    watchBtn?.addEventListener('click', () => {
      window.location.hash = playRoute;
    });

    infoBtn?.addEventListener('click', () => {
      window.location.hash = infoRoute;
    });

    // Check & Handle Watchlist Toggle
    const user = getUser();
    if (user && watchlistBtn) {
      try {
        let isAdded = await isInWatchlist(user.uid, itemId);
        const updateWatchlistButtonState = (added) => {
          if (added) {
            watchlistBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg> In Watchlist`;
            watchlistBtn.classList.add('active');
          } else {
            watchlistBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Watchlist`;
            watchlistBtn.classList.remove('active');
          }
        };

        updateWatchlistButtonState(isAdded);

        watchlistBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          watchlistBtn.disabled = true;
          try {
            if (isAdded) {
              await removeFromWatchlist(user.uid, itemId);
              isAdded = false;
            } else {
              await addToWatchlist(user.uid, {
                id: itemId,
                title: heroItem.title || heroItem.name,
                type: itemRouteType,
                poster_path: heroItem.poster_path,
                backdrop_path: heroItem.backdrop_path,
                vote_average: heroItem.vote_average
              });
              isAdded = true;
            }
            updateWatchlistButtonState(isAdded);
          } catch (wlErr) {
            console.error('[CategoryPage] Failed to toggle watchlist:', wlErr);
          } finally {
            watchlistBtn.disabled = false;
          }
        });
      } catch (err) {
        console.warn('[CategoryPage] Firestore check failed:', err);
      }
    } else {
      watchlistBtn?.addEventListener('click', () => {
        alert('Please log in to add items to your watchlist!');
      });
    }
  };

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
      media_type: item.media_type || 'movie',
      overview: item.overview || ''
    })).filter(item => item.title && item.poster_path); // only keep items with poster

    return rawList;
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
          media_type: mbItem.subjectType === 1 ? 'movie' : 'tv',
          overview: mbItem.description || mbItem.overview || ''
        }));
      }
    }

    filteredItems = [...allItems];
    renderGrid(isLiveProvider);

    // Dynamic Cinematic Hero Spotlight Hydration
    const heroItem = allItems.find(i => i.backdrop_path) || allItems[0];
    await updateHeroBillboard(heroItem);

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
              media_type: m.media_type || (m.subjectType === 2 ? 'tv' : 'movie'),
              overview: m.description || m.overview || ''
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

              // Hydrate hero billboard if it wasn't already set
              const postHero = allItems.find(i => i.backdrop_path) || allItems[0];
              updateHeroBillboard(postHero);
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
  const countEl = document.getElementById('category-results-count');
  if (countEl) {
    countEl.textContent = `${totalItems} ${totalItems === 1 ? 'title' : 'titles'} available`;
  }

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
