// ========================================
// PlayerIQ — Movie Card Component
// ========================================

import { img } from '../services/api.js';
import { getUser } from '../services/auth.js';
import { isInWatchlist, addToWatchlist, removeFromWatchlist } from '../services/firebase.js';

export function createMovieCard(item, type = 'movie', customRoute = null, customSubtitle = null, progressData = null, showDeleteBtn = false, cardLayout = 'portrait') {
  const title = item.title || item.name || 'Unknown';
  const year = (item.release_date || item.first_air_date || item.year || '').slice(0, 4);
  const rating = item.vote_average || 0;
  const ratingClass = rating >= 7 ? 'high' : rating >= 5 ? 'mid' : 'low';

  // Choose the best image based on the requested layout
  let poster = '';
  if (cardLayout === 'landscape') {
    poster = item.backdrop_path ? img.backdrop(item.backdrop_path, 'w780') :
      (item.poster_path ? img.poster(item.poster_path, 'w780') : item.cover_url);
  } else {
    // Portrait (Default)
    poster = item.poster_path
      ? img.poster(item.poster_path, 'w342')
      : item.cover_url;
  }

  const mediaType = item.media_type || type;

  // Handle route based on whether it's a MovieBox specific item
  let route = customRoute;
  if (!route) {
    if (item.subject_id && !item.tmdb_id) {
      route = `/${mediaType}/mb_${item.subject_id}`;
    } else {
      route = `/${mediaType}/${item.tmdb_id || item.id}`;
    }
  }

  const lang = item.original_language?.toUpperCase() || '';

  // Badges
  const hindiBadge = item.is_hindi ? `<span class="mb-lang-badge">🇮🇳 Hindi</span>` : '';
  const movieBoxBadge = item.source === 'moviebox' ? `<div class="mb-source-badge">MovieBox</div>` : '';

  // Progress Bar for Continue Watching
  let progressHTML = '';
  if (progressData && progressData.duration > 0) {
    const cur = progressData.currentTime || 0;
    const dur = progressData.duration;
    const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
    const timeLeftMins = Math.max(1, Math.round((dur - cur) / 60));

    progressHTML = `
      <div class="card-progress-wrap">
        <div class="card-time-left">${timeLeftMins}m left</div>
        <div class="card-progress-bar">
          <div class="card-progress-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }

  const deleteBtn = showDeleteBtn ? `
    <div class="card-delete-btn" data-delete-id="${item.id}" aria-label="Remove from Continue Watching" title="Remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </div>
  ` : '';

  let srcsetAttribute = '';
  let sizesAttribute = '';
  if (item.poster_path && cardLayout !== 'landscape') {
    srcsetAttribute = `srcset="${img.poster(item.poster_path, 'w185')} 185w, ${img.poster(item.poster_path, 'w342')} 342w, ${img.poster(item.poster_path, 'w500')} 500w, ${img.poster(item.poster_path, 'w780')} 780w"`;
    sizesAttribute = `sizes="(max-width: 768px) calc(50vw - 20px), 180px"`;
  } else if (item.backdrop_path && cardLayout === 'landscape') {
    srcsetAttribute = `srcset="${img.backdrop(item.backdrop_path, 'w300')} 300w, ${img.backdrop(item.backdrop_path, 'w780')} 780w, ${img.backdrop(item.backdrop_path, 'original')} 1280w"`;
    sizesAttribute = `sizes="(max-width: 768px) 100vw, 280px"`;
  }

  const cardWidth = cardLayout === 'landscape' ? '280px' : '180px';
  const layoutClass = cardLayout === 'landscape' ? 'landscape' : '';

  return `
    <div class="movie-card ${layoutClass}" data-route="${route}" style="width:${cardWidth}" role="button" tabindex="0" aria-label="${title}">
      <div class="movie-card-poster-wrapper">
        ${poster
      ? `<img class="movie-card-poster" src="${poster}" ${srcsetAttribute} ${sizesAttribute} alt="${title}" loading="lazy" />`
      : `<div class="movie-card-poster" style="background:var(--bg-tertiary);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:var(--text-xs);">No Image</div>`
    }
        <div class="movie-card-gradient"></div>
        ${deleteBtn}
        ${rating > 0 ? `
          <div class="movie-card-rating ${ratingClass}">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${rating.toFixed(1)}
          </div>
        ` : ''}
        ${hindiBadge}
        ${movieBoxBadge}
        ${progressData ? '' : '<div class="movie-card-quality">HD</div>'}
        ${progressHTML}
      </div>
    </div>
  `;
}

// Ensure createMovieBoxCard maps to createMovieCard so backwards compatibility remains
export const createMovieBoxCard = createMovieCard;

export function createSkeletonCard(cardLayout = 'portrait') {
  const cardWidth = cardLayout === 'landscape' ? '280px' : '180px';
  const layoutClass = cardLayout === 'landscape' ? 'landscape' : '';

  return `
    <div class="movie-card-skeleton ${layoutClass}" style="width:${cardWidth}">
      <div class="skeleton-poster"></div>
    </div>
  `;
}

// Attach click and hover handlers to all movie cards in a container
export function attachCardClicks(container) {
  container.querySelectorAll('.movie-card[data-route]').forEach(card => {
    if (card.dataset.initialized === 'true') return;
    card.dataset.initialized = 'true';

    // Delete button handler
    const deleteBtn = card.querySelector('.card-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const event = new CustomEvent('delete-progress', {
          bubbles: true,
          detail: { id: deleteBtn.dataset.deleteId }
        });
        card.dispatchEvent(event);
      });
    }

    const handler = (e) => {
      // Don't navigate if clicking delete or hover actions
      if (e.target.closest('.card-delete-btn') || e.target.closest('.preview-wishlist-btn') || e.target.closest('.preview-watch-btn')) return;
      window.location.hash = card.dataset.route;
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') handler(e); });

    // ---- Hotstar-Style Desktop Hover Expander ----
    let hoverTimer = null;
    let previewCard = null;

    const handleMouseEnter = () => {
      if (window.innerWidth <= 991) return; // Touch device responsive fallback
      
      const route = card.dataset.route || '';
      let type = '';
      let id = '';
      
      if (route.includes('/watch/movie/')) {
        type = 'movie';
        id = route.split('/watch/movie/')[1]?.split('?')[0]?.replace('mb_', '');
      } else if (route.includes('/watch/tv/')) {
        type = 'tv';
        id = route.split('/watch/tv/')[1]?.split('?')[0]?.replace('mb_', '');
      } else if (route.includes('/movie/')) {
        type = 'movie';
        id = route.split('/movie/')[1]?.split('?')[0]?.replace('mb_', '');
      } else if (route.includes('/tv/')) {
        type = 'tv';
        id = route.split('/tv/')[1]?.split('?')[0]?.replace('mb_', '');
      }

      if (!type || !id) return;

      hoverTimer = setTimeout(async () => {
        // Prevent duplicate overlays
        const existing = document.querySelector('.hover-preview-card');
        if (existing) existing.remove();

        const rect = card.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        // Fetch details from TMDB dynamically
        let tmdbData = null;
        try {
          const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=8e4ad9e56e31ab079517b5be6965b477&append_to_response=videos,release_dates,content_ratings`);
          if (res.ok) tmdbData = await res.json();
        } catch (e) {
          console.warn('Failed to fetch TMDB hover preview details', e);
        }

        // Search trailer YouTube key (filter out Red-Band, R-Rated, and restricted videos to ensure autoplay muting operates 100% of the time)
        const videos = tmdbData?.videos?.results || [];
        let cleanTrailer = videos.find(v => 
          v.type === 'Trailer' && 
          v.site === 'YouTube' && 
          !v.name.toLowerCase().includes('red band') && 
          !v.name.toLowerCase().includes('restricted') &&
          !v.name.toLowerCase().includes('r-rated') &&
          !v.name.toLowerCase().includes('r rated')
        );

        if (!cleanTrailer) {
          cleanTrailer = videos.find(v => 
            v.site === 'YouTube' && 
            !v.name.toLowerCase().includes('red band') && 
            !v.name.toLowerCase().includes('restricted') &&
            !v.name.toLowerCase().includes('r-rated') &&
            !v.name.toLowerCase().includes('r rated')
          );
        }

        if (!cleanTrailer) {
          cleanTrailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos.find(v => v.site === 'YouTube');
        }

        const youtubeKey = cleanTrailer ? cleanTrailer.key : '';

        // Extract metadata details
        const title = tmdbData?.title || tmdbData?.name || card.querySelector('.movie-card-title')?.textContent || 'Unknown';
        const rawYear = tmdbData?.release_date || tmdbData?.first_air_date || '';
        const year = rawYear.slice(0, 4) || '2026';
        const lang = tmdbData?.original_language?.toUpperCase() || 'EN';
        
        let ageRating = 'U/A 13+';
        if (type === 'movie') {
          const releaseDates = tmdbData?.release_dates?.results || [];
          const usRelease = releaseDates.find(r => r.iso_3166_1 === 'US') || releaseDates.find(r => r.iso_3166_1 === 'IN') || releaseDates[0];
          if (usRelease?.release_dates?.[0]?.certification) {
            ageRating = usRelease.release_dates[0].certification;
          }
        } else {
          const ratings = tmdbData?.content_ratings?.results || [];
          const usRating = ratings.find(r => r.iso_3166_1 === 'US') || ratings.find(r => r.iso_3166_1 === 'IN') || ratings[0];
          if (usRating?.rating) {
            ageRating = usRating.rating;
          }
        }
        if (!ageRating) ageRating = 'U/A 13+';

        let duration = '';
        if (type === 'movie' && tmdbData?.runtime) {
          const hours = Math.floor(tmdbData.runtime / 60);
          const mins = tmdbData.runtime % 60;
          duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        } else if (tmdbData?.episode_run_time?.[0]) {
          duration = `${tmdbData.episode_run_time[0]}m`;
        }

        const overview = tmdbData?.overview
          ? (tmdbData.overview.length > 140 ? tmdbData.overview.slice(0, 137) + '...' : tmdbData.overview)
          : 'No synopsis available.';

        // Calculate the centered horizontal position for the wide preview card
        const previewWidth = 320;
        let previewLeft = rect.left + scrollLeft - (previewWidth - rect.width) / 2;
        
        // Safety bounds checks so it stays fully on screen
        if (previewLeft < 16) {
          previewLeft = 16;
        } else {
          const maxLeft = window.innerWidth + scrollLeft - previewWidth - 16;
          if (previewLeft > maxLeft) {
            previewLeft = maxLeft;
          }
        }

        // Shift top slightly up so the hover expander looks perfectly layered
        let previewTop = rect.top + scrollTop - 20;
        if (previewTop < scrollTop + 16) {
          previewTop = scrollTop + 16;
        }

        // Build expanded hover preview element
        previewCard = document.createElement('div');
        previewCard.className = 'hover-preview-card';
        previewCard.style.top = `${previewTop}px`;
        previewCard.style.left = `${previewLeft}px`;
        previewCard.style.width = `${previewWidth}px`;

        const trailerHTML = youtubeKey
          ? `<div class="preview-trailer-wrapper" style="background-image:url(${img.backdrop(tmdbData?.backdrop_path || item?.backdrop_path || '')}); background-size:cover; background-position:center;">
               <iframe class="preview-iframe" src="https://www.youtube.com/embed/${youtubeKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeKey}&playsinline=1&enablejsapi=1&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&wmode=transparent&autohide=1&origin=${encodeURIComponent(window.location.origin)}" allow="autoplay" frameborder="0"></iframe>
               <button class="preview-volume-btn" aria-label="Toggle Sound">
                 <svg class="vol-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg>
                 <svg class="vol-on" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
               </button>
             </div>`
          : `<div class="preview-no-trailer" style="background-image:url(${img.backdrop(tmdbData?.backdrop_path || item?.backdrop_path || '')}); background-size:cover; background-position:center; width:100%; aspect-ratio:16/9;">
               <div class="preview-no-trailer-overlay"></div>
             </div>`;

        const watchlistIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        const watchlistCheckedIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

        previewCard.innerHTML = `
          ${trailerHTML}
          <div class="preview-details-container">
            <div class="preview-title">${title}</div>
            <div class="preview-actions">
              <button class="preview-watch-btn btn-primary" data-route="${route}">
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Watch Now
              </button>
              <button class="preview-wishlist-btn" data-id="${id}" data-type="${type}" data-title="${title}" data-poster="${tmdbData?.poster_path || item?.poster_path || ''}" data-backdrop="${tmdbData?.backdrop_path || item?.backdrop_path || ''}" data-rating="${tmdbData?.vote_average || 0}">
                ${watchlistIcon}
              </button>
            </div>
            <div class="preview-meta">
              <span class="preview-year">${year}</span>
              <span class="preview-dot">•</span>
              <span class="preview-age">${ageRating}</span>
              ${duration ? `
                <span class="preview-dot">•</span>
                <span class="preview-duration">${duration}</span>
              ` : ''}
              ${lang ? `
                <span class="preview-dot">•</span>
                <span class="preview-lang">${lang}</span>
              ` : ''}
            </div>
            <div class="preview-desc">${overview}</div>
          </div>
        `;

        document.body.appendChild(previewCard);

        // Position alignment so it center-expands smoothly
        setTimeout(() => {
          if (previewCard) previewCard.classList.add('active');
        }, 10);

        // Fade in iframe after 1800ms once initial YouTube controls have loaded & hidden
        setTimeout(() => {
          if (previewCard) {
            previewCard.querySelector('.preview-iframe')?.classList.add('playing');
          }
        }, 1800);

        // Fetch User and setup wishlist trigger state
        const user = getUser();
        const wishlistBtn = previewCard.querySelector('.preview-wishlist-btn');
        if (user && wishlistBtn) {
          try {
            const isAdded = await isInWatchlist(user.uid, id);
            if (isAdded) {
              wishlistBtn.innerHTML = watchlistCheckedIcon;
              wishlistBtn.classList.add('in-list');
              wishlistBtn.title = 'Remove from Watchlist';
            }
          } catch (e) {
            console.warn('Failed to verify watchlist state in cloud', e);
          }
        }

        // Wire Watchlist Click
        wishlistBtn?.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!user) {
            alert('Please sign in to manage your watchlist!');
            return;
          }
          const isAdded = wishlistBtn.classList.contains('in-list');
          wishlistBtn.disabled = true;
          try {
            if (isAdded) {
              await removeFromWatchlist(user.uid, id);
              wishlistBtn.innerHTML = watchlistIcon;
              wishlistBtn.classList.remove('in-list');
              wishlistBtn.title = 'Add to Watchlist';
            } else {
              await addToWatchlist(user.uid, {
                id: Number(id) || id,
                title,
                type,
                poster_path: wishlistBtn.dataset.poster ? `https://image.tmdb.org/t/p/w500${wishlistBtn.dataset.poster}` : '',
                backdrop_path: wishlistBtn.dataset.backdrop ? `https://image.tmdb.org/t/p/original${wishlistBtn.dataset.backdrop}` : '',
                vote_average: Number(wishlistBtn.dataset.rating) || 0
              });
              wishlistBtn.innerHTML = watchlistCheckedIcon;
              wishlistBtn.classList.add('in-list');
              wishlistBtn.title = 'Remove from Watchlist';
            }
          } catch (err) {
            console.error('Wishlist toggle error:', err);
          } finally {
            wishlistBtn.disabled = false;
          }
        });

        // Wire Watch Now Click
        previewCard.querySelector('.preview-watch-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          destroyPreview();
          window.location.hash = route;
        });

        // Wire Sound Toggle Click
        const volumeBtn = previewCard.querySelector('.preview-volume-btn');
        const iframe = previewCard.querySelector('.preview-iframe');
        if (volumeBtn && iframe) {
          let muted = true;
          volumeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            muted = !muted;
            
            // PostMessage to Youtube Player API (using unMute with capital M)
            iframe.contentWindow.postMessage(JSON.stringify({
              event: 'command',
              func: muted ? 'mute' : 'unMute',
              args: []
            }), '*');

            volumeBtn.querySelector('.vol-off').style.display = muted ? 'block' : 'none';
            volumeBtn.querySelector('.vol-on').style.display = muted ? 'none' : 'block';
          });
        }

        // Dismiss handlers
        const destroyPreview = () => {
          if (!previewCard) return;
          const target = previewCard;
          previewCard = null;
          target.classList.remove('active');
          setTimeout(() => target.remove(), 250);
        };

        previewCard.addEventListener('mouseleave', destroyPreview);
      }, 500);
    };

    const handleMouseLeave = () => {
      clearTimeout(hoverTimer);
    };

    card.addEventListener('mouseenter', handleMouseEnter);
    card.addEventListener('mouseleave', handleMouseLeave);
  });
}

