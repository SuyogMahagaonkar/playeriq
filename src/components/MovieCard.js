// ========================================
// PlayerIQ — Movie Card Component
// ========================================

import { img } from '../services/api.js';

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

  const cardWidth = cardLayout === 'landscape' ? '280px' : '180px';
  const layoutClass = cardLayout === 'landscape' ? 'landscape' : '';

  return `
    <div class="movie-card ${layoutClass}" data-route="${route}" style="width:${cardWidth}" role="button" tabindex="0" aria-label="${title}">
      <div class="movie-card-poster-wrapper">
        ${poster
      ? `<img class="movie-card-poster" src="${poster}" alt="${title}" loading="lazy" />`
      : `<div class="movie-card-poster" style="background:var(--bg-tertiary);width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:var(--text-xs);">No Image</div>`
    }
        <div class="movie-card-gradient"></div>
        <div class="movie-card-play">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
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
      
      <div class="movie-card-info">
        <div class="movie-card-title">${title}</div>
        <div class="movie-card-meta">
          ${customSubtitle ? `<span class="movie-card-lang" style="color:var(--primary); font-weight:600">${customSubtitle}</span>` : ''}
          <span class="movie-card-year">${year}</span>
          ${lang && !customSubtitle ? `<span class="movie-card-lang">${lang}</span>` : ''}
        </div>
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
      <div class="skeleton-title"></div>
    </div>
  `;
}

// Attach click handlers to all movie cards in a container
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
      // Don't navigate if clicking delete
      if (e.target.closest('.card-delete-btn')) return;
      window.location.hash = card.dataset.route;
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') handler(e); });
  });
}

