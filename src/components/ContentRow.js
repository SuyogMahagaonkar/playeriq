// ========================================
// PlayerIQ — Content Row (Carousel)
// ========================================

import { createMovieCard, createSkeletonCard, attachCardClicks } from './MovieCard.js';

export function createContentRow(title, items, type = 'movie', moreRoute = null, cardLayout = 'portrait', showViewMore = false) {
  let cards = '';
  if (type === 'custom') {
    cards = items; // Already HTML string
  } else {
    cards = items.map(item => createMovieCard(item, type, null, null, null, false, cardLayout)).join('');
    
    // Append a beautiful "View More" card ONLY when explicitly requested (like Netflix and Prime)
    if (showViewMore && items.length > 0) {
      const cleanTitle = title.replace(/<[^>]*>/g, '').trim();
      const isNetflixCard = cleanTitle.toLowerCase().includes('netflix');
      const themeColor = isNetflixCard ? '#e50914' : '#00a8e1';
      const shadowColor = isNetflixCard ? 'rgba(229, 9, 20, 0.3)' : 'rgba(0, 168, 225, 0.3)';

      cards += `
        <a href="#/category?title=${encodeURIComponent(cleanTitle)}" class="movie-card movie-card-portrait more-card-link netflix-style-more-card" style="
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          background: rgba(20, 20, 25, 0.5);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          height: 100%;
          min-height: 240px;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          padding: 24px;
          box-sizing: border-box;
          min-width: 160px;
          max-width: 160px;
          flex-shrink: 0;
          align-self: stretch;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
        "
        onmouseover="this.style.transform='translateY(-6px)'; this.style.borderColor='${themeColor}'; this.style.boxShadow='0 10px 25px ${shadowColor}'; this.querySelector('.circle-btn').style.transform='scale(1.1)'; this.querySelector('.circle-btn').style.background='${themeColor}'; this.querySelector('.circle-icon').style.color='#fff';"
        onmouseout="this.style.transform='none'; this.style.borderColor='rgba(255,255,255,0.06)'; this.style.boxShadow='0 4px 30px rgba(0,0,0,0.3)'; this.querySelector('.circle-btn').style.transform='none'; this.querySelector('.circle-btn').style.background='rgba(255, 255, 255, 0.05)'; this.querySelector('.circle-icon').style.color='${themeColor}';"
        >
          <!-- Accent Glow from Bottom -->
          <div style="
            position: absolute;
            bottom: -30px;
            width: 100px;
            height: 100px;
            background: ${themeColor};
            filter: blur(40px);
            opacity: 0.15;
            pointer-events: none;
            transition: all 0.4s;
          "></div>

          <!-- Glowing Interactive Arrow Button -->
          <div class="circle-btn" style="
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          ">
            <i class="circle-icon" data-lucide="arrow-right" style="color: ${themeColor}; width: 22px; height: 22px; transition: all 0.4s;"></i>
          </div>

          <!-- Stylized Text Block -->
          <span style="
            color: #fff;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 2px;
            text-align: center;
            display: block;
            margin-bottom: 4px;
          ">Explore All</span>
          
          <span style="
            color: var(--text-muted);
            font-size: 13px;
            font-weight: 600;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
          ">${cleanTitle.replace('Latest from ', '')}</span>
        </a>
      `;
    }
  }

  return `
    <section class="content-row">
      <div class="content-row-header">
        <h2 class="content-row-title">${title}</h2>
        ${moreRoute ? `
          <a href="#${moreRoute}" class="content-row-more">
            Show More <i data-lucide="chevron-right"></i>
          </a>
        ` : ''}
      </div>
      <div class="content-row-container">
        <button class="content-row-arrow content-row-arrow-left" aria-label="Scroll left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="content-row-scroll">
          ${cards}
        </div>
        <button class="content-row-arrow content-row-arrow-right" aria-label="Scroll right">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </section>
  `;
}

export function createSkeletonRow(title, id = '', cardLayout = 'portrait') {
  const skeletons = Array(8).fill(null).map(() => createSkeletonCard(cardLayout)).join('');
  return `
    <section class="content-row lazy-row" ${id ? `id="${id}"` : ''}>
      <div class="content-row-header">
        <h2 class="content-row-title">${title}</h2>
      </div>
      <div class="content-row-container">
        <div class="content-row-scroll">
          ${skeletons}
        </div>
      </div>
    </section>
  `;
}

// Initialize carousel arrows + drag-to-scroll
export function initContentRows(container) {
  container.querySelectorAll('.content-row-container').forEach(row => {
    if (row.dataset.carouselInit === 'true') return;
    row.dataset.carouselInit = 'true';

    const scroll      = row.querySelector('.content-row-scroll');
    const leftArrow   = row.querySelector('.content-row-arrow-left');
    const rightArrow  = row.querySelector('.content-row-arrow-right');

    if (!scroll) return;

    // Calculate scroll amount based on visible width
    const getScrollAmount = () => scroll.clientWidth * 0.85;

    // ---- Arrow click handlers ----
    leftArrow?.addEventListener('click', () => {
      scroll.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
    });

    rightArrow?.addEventListener('click', () => {
      scroll.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
    });

    // ---- Arrow visibility (simple: both visible, hide only at edges) ----
    // Left starts hidden since we start at position 0
    if (leftArrow) leftArrow.classList.add('hidden');
    // Right arrow is NEVER pre-hidden - always visible unless truly no overflow

    function updateArrows() {
      const atStart = scroll.scrollLeft <= 5;
      const atEnd = scroll.scrollLeft >= scroll.scrollWidth - scroll.clientWidth - 5;
      if (leftArrow) leftArrow.classList.toggle('hidden', atStart);
      if (rightArrow) rightArrow.classList.toggle('hidden', atEnd);
    }

    scroll.addEventListener('scroll', updateArrows, { passive: true });

    // ---- Drag-to-scroll (desktop) ----
    // Track drag state; only navigate if not dragging
    let dragStartX   = 0;
    let dragScrollL  = 0;
    let isDragging   = false;
    let dragMoved    = false;

    scroll.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // only left click
      isDragging  = true;
      dragMoved   = false;
      dragStartX  = e.pageX;
      dragScrollL = scroll.scrollLeft;
      scroll.style.cursor = 'grabbing';
      scroll.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.pageX - dragStartX;
      if (Math.abs(dx) > 4) dragMoved = true; // threshold to consider it a drag
      scroll.scrollLeft = dragScrollL - dx;
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      scroll.style.cursor = '';
      scroll.style.userSelect = '';
    });

    // Prevent card navigation click after a drag
    scroll.addEventListener('click', (e) => {
      if (dragMoved) {
        e.stopPropagation();
        e.preventDefault();
        dragMoved = false;
      }
    }, true); // capture phase
  });

  // Attach card click handlers
  attachCardClicks(container);
}
