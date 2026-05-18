// ========================================
// PlayerIQ — 18+ Premium Page
// ========================================

import { searchMovieBox } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { createFooter } from '../components/Footer.js';
import { navigate } from '../services/router.js';

let currentTab = 'all';
let isLoading = false;

const TABS = [
  { id: 'all',        name: '🔥 All Adult Content' },
  { id: 'vivamax',    name: '🇵🇭 Vivamax Hits' },
  { id: 'indian',     name: '🇮🇳 Indian Softcore' },
  { id: 'japanese',   name: '🇯🇵 JAV & Hentai' },
];

export async function render18PlusPage({ container }) {
  const isSafe = localStorage.getItem('piq_safesearch') !== 'false';
  if (isSafe) {
    navigate('/');
    return;
  }

  isLoading = false;
  currentTab = 'all';

  container.innerHTML = `
    <div class="movie-grid-page adult-zone-page animate-fade-in">
      <div class="movie-grid-header adult-header" style="background: linear-gradient(135deg, rgba(255, 0, 85, 0.15) 0%, rgba(102, 0, 34, 0.05) 100%); border: 1px solid rgba(255, 0, 85, 0.2); padding: 30px; border-radius: 16px; margin-bottom: 30px;">
        <div style="display:flex; align-items:center; gap: 15px; margin-bottom: 8px;">
          <span style="background: #ff0055; color: #fff; font-size: 13px; font-weight: bold; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(255,0,85,0.4);">18+ ONLY</span>
          <h1 class="movie-grid-title" style="margin:0; text-shadow: 0 0 10px rgba(255,0,85,0.3);">Adult Premium Zone</h1>
        </div>
        <p style="color: var(--text-dim); margin: 0; font-size: 15px; line-height: 1.5;">Welcome to the premium adult streaming library. Access global erotic hits, Vivamax collections, Indian softcore, and JAV/Hentai releases uncensored.</p>
      </div>

      <div class="genre-pills" id="adult-tabs" style="display:flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 24px;">
        ${TABS.map(tab => `
          <button class="genre-pill ${currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}" style="${currentTab === tab.id ? 'background: #ff0055 !important; border-color: #ff0055 !important;' : ''}">
            ${tab.name}
          </button>
        `).join('')}
      </div>

      <div class="movie-grid stagger-children" id="adult-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px;"></div>
    </div>
    ${createFooter()}
  `;

  // Style overrides for premium feel
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    .genre-pill.active {
      background: #ff0055 !important;
      border-color: #ff0055 !important;
      box-shadow: 0 4px 15px rgba(255,0,85,0.4) !important;
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
      await loadAdultContent();
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

async function loadAdultContent() {
  if (isLoading) return;
  isLoading = true;

  const grid = document.getElementById('adult-grid');
  if (grid) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><div class="load-more-spinner" style="margin: 0 auto 15px;"></div>Decrypting SafeSearch Bypass...</div>';
  }

  try {
    let searchQueries = [];
    if (currentTab === 'all') {
      searchQueries = ['vivamax', 'ullu', 'kooku', 'primeplay', 'jav', 'hentai', 'sexa'];
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

    if (mergedResults.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No adult content found. Check server connections.</div>';
    } else {
      // Map and render cards (ignoring SafeSearch blocks here since we are in the explicit bypass screen!)
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

      grid.innerHTML = cards;
      attachCardClicks(grid);
    }
  } catch (err) {
    console.error('Failed to load adult catalog:', err);
    if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Failed to decrypt adult library. Please refresh.</div>';
  }

  isLoading = false;
}
