// ========================================
// PlayerIQ — 18+ Premium Page
// ========================================

import { searchMovieBox } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { navigate } from '../services/router.js';

let currentTab = 'all';
let isLoading = false;
let loadedMore = false;

const TABS = [
  { id: 'all', name: '🔥 All Adult Content' },
  { id: 'vivamax', name: '🇵🇭 Vivamax Hits' },
  { id: 'indian', name: '🇮🇳 Indian Softcore' },
  { id: 'japanese', name: '🇯🇵 JAV & Hentai' },
];

export async function render18PlusPage({ container }) {
  const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
  if (isSafe) {
    navigate('/');
    return;
  }

  isLoading = false;
  currentTab = 'all';
  loadedMore = false;

  container.innerHTML = `
    <div class="movie-grid-page adult-zone-page animate-fade-in">
      <div class="movie-grid-header adult-header" style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(88, 28, 135, 0.05) 100%); border: 1px solid rgba(168, 85, 247, 0.2); padding: 30px; border-radius: 16px; margin-bottom: 30px;">
        <div style="display:flex; align-items:center; gap: 15px; margin-bottom: 8px;">
          <span style="background: var(--accent); color: #fff; font-size: 13px; font-weight: bold; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(168,85,247,0.4);">18+ ONLY</span>
          <h1 class="movie-grid-title" style="margin:0; text-shadow: 0 0 10px rgba(168,85,247,0.3);">Adult Premium Zone</h1>
        </div>
        <p style="color: var(--text-dim); margin: 0; font-size: 15px; line-height: 1.5;">Welcome to the premium adult streaming library. Access global erotic hits, Vivamax collections, Indian softcore, and JAV/Hentai releases uncensored.</p>
      </div>

      <div class="genre-pills" id="adult-tabs" style="display:flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 24px;">
        ${TABS.map(tab => `
          <button class="genre-pill ${currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}" style="${currentTab === tab.id ? 'background: var(--accent) !important; border-color: var(--accent) !important;' : ''}">
            ${tab.name}
          </button>
        `).join('')}
      </div>

      <div class="movie-grid stagger-children" id="adult-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px;"></div>
      
      <div id="adult-load-more-container" style="display: none; justify-content: center; margin: 30px 0 10px;">
        <button id="adult-load-more-btn" style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); color: var(--text-normal); padding: 10px 24px; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
          <span>Load More Adult Content</span>
          <div id="adult-load-more-spinner" class="load-more-btn-spinner" style="display: none; width: 14px; height: 14px; border-width: 2px;"></div>
        </button>
      </div>
    </div>
    ${createFooter()}
  `;

  // Style overrides for premium feel
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    .genre-pill.active {
      background: var(--accent) !important;
      border-color: var(--accent) !important;
      box-shadow: 0 4px 15px rgba(168,85,247,0.4) !important;
    }
  `;
  container.appendChild(styleEl);

  // Load initial content
  await loadAdultContent();

  // Tab switching
  document.querySelectorAll('#adult-tabs .genre-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('#adult-tabs .genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentTab = pill.dataset.tab;
      loadedMore = false;
      await loadAdultContent();
    });
  });

  // Load More Button Click
  const loadMoreBtn = document.getElementById('adult-load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      const spinner = document.getElementById('adult-load-more-spinner');
      if (spinner) spinner.style.display = 'inline-block';
      loadMoreBtn.disabled = true;
      loadedMore = true;
      await loadAdultContent(true);
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

async function loadAdultContent(append = false) {
  isLoading = true;

  const grid = document.getElementById('adult-grid');
  const loadMoreContainer = document.getElementById('adult-load-more-container');
  const loadMoreBtn = document.getElementById('adult-load-more-btn');
  const loadMoreSpinner = document.getElementById('adult-load-more-spinner');

  if (!append && grid) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><div class="load-more-spinner" style="margin: 0 auto 15px;"></div>Decrypting SafeSearch Bypass...</div>';
  }

  try {
    let searchQueries = [];
    if (currentTab === 'all') {
      if (append) {
        searchQueries = ['kooku', 'hentai', 'sexa'];
      } else {
        searchQueries = ['vivamax', 'ullu', 'primeplay', 'jav'];
      }
    } else if (currentTab === 'vivamax') {
      searchQueries = ['vivamax', 'sulutan', 'bula', 'higop'];
    } else if (currentTab === 'indian') {
      searchQueries = ['ullu', 'kooku', 'primeplay', 'chikooflix', 'rabbit movies'];
    } else if (currentTab === 'japanese') {
      searchQueries = ['jav', 'hentai', 'megane no megami', 'mama katsu'];
    }

    // Query in parallel for maximum performance
    const promises = searchQueries.map(q => searchMovieBox(q, 'all').catch(() => ({ results: [] })));
    const responses = await Promise.all(promises);

    // Merge and deduplicate results
    const seenIds = new Set();
    const mergedResults = [];

    // If appending, preserve already rendered ids
    if (append && grid) {
      grid.querySelectorAll('.movie-card').forEach(card => {
        const cleanId = card.dataset.id || card.id;
        if (cleanId) seenIds.add(cleanId.replace('mb_', ''));
      });
    }

    responses.forEach(res => {
      if (res.results) {
        res.results.forEach(item => {
          const id = item.subject_id || item.id || item.subjectId;
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            mergedResults.push(item);
          }
        });
      }
    });

    if (!grid) return;

    const cards = mergedResults.map(m => {
      const typeStr = String(m.subjectType || m.type) === '2' ? 'tv' : 'movie';
      const mapped = {
        id: `mb_${m.subject_id || m.id || m.subjectId}`,
        title: m.title,
        poster_path: m.cover?.url || m.cover_url || m.poster_path,
        vote_average: m.imdbRate || m.rating || null,
        release_date: m.releaseDate || m.release_date || m.year,
      };
      return createMovieCard(mapped, typeStr);
    }).join('');

    if (append) {
      if (mergedResults.length > 0) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cards;
        while (tempDiv.firstChild) {
          grid.appendChild(tempDiv.firstChild);
        }
        attachCardClicks(grid);
      }
    } else {
      if (mergedResults.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No adult content found. Check server connections.</div>';
      } else {
        grid.innerHTML = cards;
        attachCardClicks(grid);
      }
    }

    // Toggle Load More button container visibility
    if (loadMoreContainer) {
      if (currentTab === 'all' && !loadedMore && mergedResults.length > 0) {
        loadMoreContainer.style.display = 'flex';
      } else {
        loadMoreContainer.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Failed to load adult catalog:', err);
    if (!append && grid) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Failed to decrypt adult library. Please refresh.</div>';
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.disabled = false;
  }
  if (loadMoreSpinner) {
    loadMoreSpinner.style.display = 'none';
  }
  isLoading = false;
}
