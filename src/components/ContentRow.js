// ========================================
// PlayerIQ — Content Row (Carousel)
// ========================================

import { createMovieCard, createSkeletonCard, attachCardClicks } from './MovieCard.js';

export function createContentRow(title, items, type = 'movie', moreRoute = null, cardLayout = 'portrait') {
  let cards = '';
  if (type === 'custom') {
    cards = items; // Already HTML string
  } else {
    cards = items.map(item => createMovieCard(item, type, null, null, null, false, cardLayout)).join('');
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
