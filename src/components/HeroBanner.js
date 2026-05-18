// ========================================
// PlayerIQ — Hero Banner Component
// ========================================

import { img } from '../services/api.js';
import { navigate } from '../services/router.js';

export function createHeroBanner(items) {
  const filtered = items.filter(m => m.backdrop_path).slice(0, 6);
  if (!filtered.length) return '';

  const slides = filtered.map((m, i) => {
    const title = m.title || m.name;
    const year = (m.release_date || m.first_air_date || '').slice(0, 4);
    const rating = m.vote_average?.toFixed(1) || '—';
    const type = m.media_type === 'tv' ? 'tv' : 'movie';
    const overview = m.overview || '';

    const bannerSrcset = `srcset="${img.backdrop(m.backdrop_path, 'w300')} 300w, ${img.backdrop(m.backdrop_path, 'w780')} 780w, ${img.backdrop(m.backdrop_path, 'w1280')} 1280w, ${img.backdrop(m.backdrop_path, 'original')} 1920w"`;
    const bannerSizes = `sizes="(max-width: 768px) 100vw, 100vw"`;

    return `
      <div class="hero-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
        <img class="hero-backdrop" src="${img.backdrop(m.backdrop_path, 'original')}" ${bannerSrcset} ${bannerSizes} alt="${title}" loading="eager" />
        <div class="hero-gradient-left"></div>
        <div class="hero-gradient-bottom"></div>
        <div class="hero-content">
          <div class="hero-badge">
            <i data-lucide="trending-up" style="width:14px;height:14px"></i>
            Trending #${i + 1}
          </div>
          <h1 class="hero-title">${title}</h1>
          <div class="hero-meta">
            <span class="hero-rating">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              ${rating}
            </span>
            <span class="hero-dot"></span>
            <span>${year}</span>
            <span class="hero-dot"></span>
            <span>${type === 'tv' ? 'TV Series' : 'Movie'}</span>
          </div>
          <p class="hero-overview">${overview}</p>
          <div class="hero-actions">
            <button class="hero-btn hero-btn-primary" data-route="/watch/${type}/${m.id}">
              <i data-lucide="play" style="width:20px;height:20px"></i>
              Watch Now
            </button>
            <button class="hero-btn hero-btn-secondary" data-route="/${type}/${m.id}">
              <i data-lucide="info" style="width:18px;height:18px"></i>
              More Info
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const indicators = filtered.map((_, i) => `
    <button class="hero-indicator ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
  `).join('');

  return `
    <div class="hero-banner" id="hero-banner">
      ${slides}
      <button class="hero-nav hero-nav-prev" id="hero-prev">
        <i data-lucide="chevron-left"></i>
      </button>
      <button class="hero-nav hero-nav-next" id="hero-next">
        <i data-lucide="chevron-right"></i>
      </button>
      <div class="hero-indicators">${indicators}</div>
    </div>
  `;
}

export function initHeroBanner() {
  const banner = document.getElementById('hero-banner');
  if (!banner) return () => {};

  let current = 0;
  const slides = banner.querySelectorAll('.hero-slide');
  const indicators = banner.querySelectorAll('.hero-indicator');
  const total = slides.length;

  function goTo(index) {
    slides[current].classList.remove('active');
    indicators[current].classList.remove('active');
    current = ((index % total) + total) % total;
    slides[current].classList.add('active');
    indicators[current].classList.add('active');
  }

  // Auto advance
  let interval = setInterval(() => goTo(current + 1), 6000);

  const resetInterval = () => {
    clearInterval(interval);
    interval = setInterval(() => goTo(current + 1), 6000);
  };

  // Navigation
  banner.querySelector('#hero-prev')?.addEventListener('click', () => { goTo(current - 1); resetInterval(); });
  banner.querySelector('#hero-next')?.addEventListener('click', () => { goTo(current + 1); resetInterval(); });

  indicators.forEach(ind => {
    ind.addEventListener('click', () => { goTo(parseInt(ind.dataset.index)); resetInterval(); });
  });

  // Button clicks
  banner.querySelectorAll('[data-route]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  return () => clearInterval(interval);
}
