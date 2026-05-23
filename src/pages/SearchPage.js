// ========================================
// PlayerIQ — Search Page (MovieBox Native)
// ========================================

import { searchMovieBox } from '../services/api.js';
import { createMovieCard, attachCardClicks } from '../components/MovieCard.js';
import { addRecentSearch, getState } from '../services/state.js';
import { createFooter } from '../components/Footer.js';
import { getWatchHistory } from '../services/auth.js';

function trackTelemetryEvent(eventName, eventData = {}) {
  console.log(`[Telemetry] Event: ${eventName}`, eventData);
  window.playeriqTelemetry = window.playeriqTelemetry || [];
  window.playeriqTelemetry.push({ eventName, eventData, timestamp: Date.now() });
}

function checkAndCollapseHeader() {
  if (window.innerWidth <= 767) {
    const avatar = document.getElementById('navbar-avatar');
    if (avatar) {
      avatar.remove();
    }
  }
}

// Section header HTML
function sectionHeader(title, count, icon) {
  return `
    <div class="search-section-header" style="grid-column:1/-1">
      <span class="search-section-icon">${icon}</span>
      <h2 class="search-section-title">${title}</h2>
      ${count ? `<span class="search-section-count">${count} results</span>` : ''}
    </div>
  `;
}

export async function renderSearchPage({ query, container }) {
  const q = query.q || '';
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    checkAndCollapseHeader();

    // ==== Mobile Category-Aware Offline Caching Helper ====
    async function getCachedSearch(query) {
      const cacheKey = 'playeriq_search_suggestions_cache';
      let cache = {};
      try {
        cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      } catch (e) {}

      const cachedEntry = cache[query];
      const now = Date.now();
      const CACHE_TTL = 3600000; // 1 hour TTL

      if (navigator.onLine) {
        try {
          const res = await searchMovieBox(query);
          const items = res.results || [];
          cache[query] = { items, timestamp: now };
          localStorage.setItem(cacheKey, JSON.stringify(cache));
          return items;
        } catch (err) {
          console.warn(`Fetch failed for query "${query}", using cache fallback:`, err);
        }
      }

      if (cachedEntry) {
        return cachedEntry.items;
      }
      return [];
    }

    // ==== Grouped suggestions HTML renderer ====
    function renderSuggestionGroup(title, items) {
      const groupItems = items.map(item => {
        const isTV = item.type === 'tv' || item.subjectType === 2;
        const mediaId = item.id?.startsWith('mb_') ? item.id : `mb_${item.id || item.subjectId}`;
        const route = isTV ? `/tv/${mediaId}` : `/movie/${mediaId}`;
        
        const displayTitle = item.title || item.name || '';
        const rating = item.vote_average || item.imdbRate || '—';
        const year = (item.release_date || item.year || '').slice(0, 4) || '—';
        const poster = item.poster_path || item.cover?.url || item.coverUrl || '';
        const typeLabel = isTV ? 'Series' : 'Movie';

        return `
          <div class="search-suggestion-item" data-route="${route}" data-title="${displayTitle}" style="display:flex;align-items:center;gap:12px;padding:10px 0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);" role="option">
            <img src="${poster || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150"><rect fill="%231a1a2e" width="100" height="150"/></svg>')}" alt="${displayTitle}" style="width:40px;height:55px;object-fit:cover;border-radius:4px;" loading="lazy" />
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayTitle}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:6px;">
                <span style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;color:var(--text-secondary);">${typeLabel}</span>
                <span>⭐ ${rating}</span>
                <span>•</span>
                <span>${year}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="suggestion-group" style="margin-bottom: 20px;">
          <h4 style="color:var(--text-muted);font-size:12px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;font-weight:700;">${title}</h4>
          <div class="suggestion-group-list" role="listbox">
            ${groupItems}
          </div>
        </div>
      `;
    }

    async function fetchAndRenderSuggestions(queryValue, activeCategory = 'Trending') {
      overlaySuggestions.innerHTML = `
        <div style="display:flex;justify-content:center;padding:40px 0;">
          <div class="load-more-spinner"></div>
        </div>
      `;

      try {
        // Group 1: Trending
        let trendingData = [];
        try {
          trendingData = await getCachedSearch('Trending');
        } catch (e) {
          console.warn(e);
        }

        // Group 2: Personalized (History / Watchlist)
        let personalizedData = [];
        try {
          const localWatchHistory = JSON.parse(localStorage.getItem('piq_continue_watching') || '[]');
          personalizedData = localWatchHistory.slice(0, 3).map(item => ({
            id: item.id,
            title: item.title,
            poster_path: item.poster_path,
            vote_average: item.currentTime && item.duration ? 8.5 : 7.0,
            release_date: '2024',
            type: item.type,
            isPersonalized: true
          }));
        } catch (e) {
          console.warn(e);
        }

        // Group 3: Category specific
        let categoryData = [];
        if (activeCategory && activeCategory !== 'Trending') {
          try {
            categoryData = await getCachedSearch(activeCategory);
          } catch (e) {
            console.warn(e);
          }
        }

        // Group 4: Query Completions (Matches)
        let queryCompletions = [];
        if (queryValue) {
          try {
            queryCompletions = await getCachedSearch(queryValue);
          } catch (e) {
            console.warn(e);
          }
        }

        let suggestionsHTML = '';

        const trendingItems = trendingData.slice(0, 3);
        if (trendingItems.length > 0) {
          suggestionsHTML += renderSuggestionGroup('Trending Now 🔥', trendingItems);
        }

        if (personalizedData.length > 0) {
          suggestionsHTML += renderSuggestionGroup('For You 💖', personalizedData);
        }

        if (categoryData.length > 0) {
          suggestionsHTML += renderSuggestionGroup(`${activeCategory} Top Picks ✨`, categoryData.slice(0, 3));
        }

        if (queryValue && queryCompletions.length > 0) {
          const filteredCompletions = queryCompletions.filter(item => {
            const idStr = `mb_${item.id || item.subjectId}`;
            const trendingHas = trendingItems.some(x => `mb_${x.id || x.subjectId}` === idStr);
            const categoryHas = categoryData.slice(0, 3).some(x => `mb_${x.id || x.subjectId}` === idStr);
            return !trendingHas && !categoryHas;
          }).slice(0, 3);

          if (filteredCompletions.length > 0) {
            suggestionsHTML += renderSuggestionGroup('Search Matches 🎬', filteredCompletions);
          }
        }

        if (!suggestionsHTML) {
          suggestionsHTML = `
            <div style="padding:40px;color:var(--text-muted);text-align:center;">
              <i data-lucide="compass" style="width:36px;height:36px;margin-bottom:12px;opacity:0.5;"></i>
              <div>No suggestions found. Try another term!</div>
            </div>
          `;
        }

        overlaySuggestions.innerHTML = suggestionsHTML;
        if (window.lucide) window.lucide.createIcons();

        // Click suggest item logic
        overlaySuggestions.querySelectorAll('.search-suggestion-item').forEach(item => {
          item.addEventListener('click', () => {
            const route = item.dataset.route;
            const title = item.dataset.title;
            if (route) {
              trackTelemetryEvent('suggestion_click', { suggestion_title: title, route: route });
              overlay.style.display = 'none';
              window.location.hash = route;
            }
          });
        });

      } catch (err) {
        console.error('Suggestions rendering error:', err);
        overlaySuggestions.innerHTML = `<div style="padding:20px;color:var(--text-muted);text-align:center;">Failed to fetch suggestions.</div>`;
      }
    }

    // ---- Render Mobile-Specific Premium Search Page ----
    container.innerHTML = `
      <div class="mobile-search-page">
        <!-- Pill Search Bar -->
        <div class="mobile-search-pill-container">
          <div class="mobile-search-pill">
            <i data-lucide="search" class="search-icon"></i>
            <input type="text" id="mobile-search-input" class="mobile-search-input" placeholder="Search movies, shows..." value="${q}" autocomplete="off" />
            <button class="mobile-search-voice" id="mobile-search-voice" title="Voice Search">
              <i data-lucide="mic"></i>
            </button>
            <button class="mobile-search-clear" id="mobile-search-clear" style="display:${q ? 'flex' : 'none'}">
              <i data-lucide="x"></i>
            </button>
          </div>
        </div>

        <!-- Genre Filter Chips (Quick Discovery) -->
        <div class="mobile-genre-chips-container">
          <div class="mobile-genre-scroll">
            <button class="genre-pill" data-search="Trending">🔥 Trending</button>
            <button class="genre-pill" data-search="Action">🍿 Action</button>
            <button class="genre-pill" data-search="Comedy">😂 Comedy</button>
            <button class="genre-pill" data-search="Drama">🎭 Drama</button>
            <button class="genre-pill" data-search="Anime">✨ Anime</button>
            <button class="genre-pill" data-search="Sci-Fi">🚀 Sci-Fi</button>
          </div>
        </div>

        <!-- Suggestions Panel (Netflix-style full-screen overlay on focus/type) -->
        <div class="mobile-search-overlay" id="mobile-search-overlay" style="display: none;" role="dialog" aria-modal="true" aria-label="Search suggestions">
          <div class="mobile-overlay-category-chips" role="tablist">
            <button class="overlay-category-chip active" role="tab" aria-selected="true" data-category="Trending">🔥 Trending</button>
            <button class="overlay-category-chip" role="tab" aria-selected="false" data-category="Anime">✨ Anime</button>
            <button class="overlay-category-chip" role="tab" aria-selected="false" data-category="Action">🍿 Action</button>
          </div>
          <div class="mobile-overlay-suggestions" id="mobile-overlay-suggestions"></div>
        </div>

        <!-- Main Search Content (Results or Recent Searches) -->
        <div class="mobile-search-content" id="mobile-search-content">
          <!-- Populated dynamically -->
        </div>
      </div>
      ${createFooter()}
    `;

    const input = container.querySelector('#mobile-search-input');
    const clearBtn = container.querySelector('#mobile-search-clear');
    const voiceBtn = container.querySelector('#mobile-search-voice');
    const overlay = container.querySelector('#mobile-search-overlay');
    const overlaySuggestions = container.querySelector('#mobile-overlay-suggestions');
    const content = container.querySelector('#mobile-search-content');

    // Recent Searches Helper
    function renderRecentAndInitial() {
      const recent = getState('recentSearches');
      content.innerHTML = `
        ${recent.length ? `
          <div class="recent-searches-section" style="padding: 16px;">
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px;font-weight:600;">Recent Searches</p>
            <div class="recent-search-list" style="display:flex;flex-direction:column;gap:12px;">
              ${recent.map(r => `
                <div class="recent-search-item" data-search="${r}" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <i data-lucide="clock" style="width:16px;height:16px;color:var(--text-muted);"></i>
                    <span style="font-size:14px;color:var(--text-primary);">${r}</span>
                  </div>
                  <i data-lucide="arrow-up-left" style="width:16px;height:16px;color:var(--text-muted);"></i>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div class="empty-state-title">Search for Movies &amp; TV Shows</div>
            <div class="empty-state-text">Search the entire MovieBox catalog.</div>
          </div>
        `}
      `;

      // Click on recent search
      content.querySelectorAll('.recent-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const val = item.dataset.search;
          input.value = val;
          triggerSearch(val);
        });
      });
      if (window.lucide) window.lucide.createIcons();
    }

    async function triggerSearch(val) {
      if (!val.trim()) {
        renderRecentAndInitial();
        return;
      }
      addRecentSearch(val);
      clearBtn.style.display = 'flex';
      overlay.style.display = 'none';

      content.innerHTML = `
        <div class="movie-grid-page" style="padding-top: 10px;">
          <div class="movie-grid stagger-children" id="mobile-search-results">
            <div class="load-more-trigger" style="grid-column:1/-1">
              <div class="load-more-spinner"></div>
              <p style="color:var(--text-muted);margin-top:12px">Searching MovieBox…</p>
            </div>
          </div>
        </div>
      `;

      try {
        const mbResult = await searchMovieBox(val, 'all');
        const grid = content.querySelector('#mobile-search-results');
        if (!grid) return;
        grid.innerHTML = '';

        const mbItems = mbResult.results || [];
        if (mbItems.length) {
          grid.innerHTML += sectionHeader('Search Results', mbItems.length, '🎬');
          const cards = mbItems.map(m => {
            const mapped = {
              id: `mb_${m.id || m.subjectId}`,
              title: m.title,
              poster_path: m.cover?.url || m.poster_path,
              vote_average: m.imdbRate || null,
              release_date: m.releaseDate || m.year,
            };
            return createMovieCard(mapped, m.subjectType === 2 ? 'tv' : 'movie');
          }).join('');
          grid.innerHTML += cards;
          attachCardClicks(grid);
        } else {
          grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;margin-top:40px">
              <div class="empty-state-title">No results found</div>
              <div class="empty-state-text">We couldn't find anything matching "${val}".</div>
            </div>
          `;
        }
      } catch (err) {
        console.error('Mobile search error:', err);
        const grid = content.querySelector('#mobile-search-results');
        if (grid) {
          grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;margin-top:40px">
              <div class="empty-state-title">Search failed</div>
              <div class="empty-state-text">Could not connect to MovieBox.</div>
            </div>
          `;
        }
      }
      if (window.lucide) window.lucide.createIcons();
    }

    // Input focus handler -> open full screen suggestions sheet
    input.addEventListener('focus', () => {
      checkAndCollapseHeader();
      overlay.style.display = 'block';
      trackTelemetryEvent('search_open');
      const activeChip = overlay.querySelector('.overlay-category-chip.active');
      const activeCategory = activeChip ? activeChip.dataset.category : 'Trending';
      fetchAndRenderSuggestions(input.value.trim(), activeCategory);
    });

    // Debounced search suggestion input handler
    let mobSearchTimeout = null;
    input.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearBtn.style.display = val ? 'flex' : 'none';

      if (mobSearchTimeout) clearTimeout(mobSearchTimeout);
      mobSearchTimeout = setTimeout(() => {
        const activeChip = overlay.querySelector('.overlay-category-chip.active');
        const activeCategory = activeChip ? activeChip.dataset.category : 'Trending';
        fetchAndRenderSuggestions(val, activeCategory);
      }, 250);
    });

    // Dialog Category chips clicks
    const overlayChips = overlay.querySelectorAll('.overlay-category-chip');
    overlayChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        overlayChips.forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-selected', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-selected', 'true');
        
        const category = chip.dataset.category;
        trackTelemetryEvent('season_selected', { category_selected: category });
        fetchAndRenderSuggestions(input.value.trim(), category);
      });
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        triggerSearch(val);
        input.blur();
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      overlaySuggestions.innerHTML = '';
      renderRecentAndInitial();
      input.focus();
    });

    // Close overlay on outside tap
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.mobile-search-page')) {
        overlay.style.display = 'none';
      }
    });

    // Voice search setup for mobile
    if (voiceBtn) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          voiceBtn.style.color = '#ff0055';
          input.placeholder = 'Listening...';
        };

        recognition.onerror = () => {
          voiceBtn.style.color = 'var(--text-muted)';
          input.placeholder = 'Search movies, shows...';
        };

        recognition.onend = () => {
          voiceBtn.style.color = 'var(--text-muted)';
          input.placeholder = 'Search movies, shows...';
        };

        recognition.onresult = (evt) => {
          const transcript = evt.results[0][0].transcript;
          input.value = transcript;
          triggerSearch(transcript);
        };

        voiceBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          try {
            recognition.start();
          } catch (err) {
            console.warn(err);
          }
        });
      } else {
        voiceBtn.style.display = 'none';
      }
    }

    // Genre Filter Chips setup
    container.querySelectorAll('.genre-pill[data-search]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.search;
        input.value = val;
        triggerSearch(val);
      });
    });

    // Load initial
    if (q) {
      triggerSearch(q);
    } else {
      renderRecentAndInitial();
    }

    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // ---- Desktop Search Page (Unchanged) ----
  if (!q) {
    const recent = getState('recentSearches');
    container.innerHTML = `
      <div class="movie-grid-page">
        <h1 class="movie-grid-title">Search</h1>
        
        <!-- Hotstar-style Popular Genre Pills -->
        <p style="color:var(--text-muted);margin-bottom:var(--space-md)">Popular Categories</p>
        <div class="genre-pills" style="margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 8px;">
          <button class="genre-pill" data-search="Trending">🔥 Trending</button>
          <button class="genre-pill" data-search="Action">🍿 Action</button>
          <button class="genre-pill" data-search="Comedy">😂 Comedy</button>
          <button class="genre-pill" data-search="Drama">🎭 Drama</button>
          <button class="genre-pill" data-search="Anime">✨ Anime</button>
          <button class="genre-pill" data-search="Sci-Fi">🚀 Sci-Fi</button>
        </div>

        ${recent.length ? `
          <p style="color:var(--text-muted);margin-bottom:var(--space-sm);margin-top:var(--space-md)">Recent Searches</p>
          <div class="genre-pills" style="margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 8px;">
            ${recent.map(r => `<button class="genre-pill" data-search="${r}">${r}</button>`).join('')}
          </div>
        ` : ''}

        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div class="empty-state-title">Search for Movies &amp; TV Shows</div>
          <div class="empty-state-text">Search the entire MovieBox catalog.</div>
        </div>
      </div>
      ${createFooter()}
    `;
    container.querySelectorAll('[data-search]').forEach(btn => {
      btn.addEventListener('click', () => {
        const queryStr = btn.dataset.search;
        const navInput = document.getElementById('search-input');
        if (navInput) {
          navInput.value = queryStr;
          const clearBtn = document.getElementById('search-clear');
          if (clearBtn) clearBtn.style.display = 'flex';
        }
        window.location.hash = `/search?q=${encodeURIComponent(queryStr)}`;
      });
    });
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  addRecentSearch(q);

  // Show loading skeleton
  container.innerHTML = `
    <div class="movie-grid-page">
      <h1 class="movie-grid-title">Results for &ldquo;${q}&rdquo;</h1>
      <div class="movie-grid stagger-children" id="search-results">
        <div class="load-more-trigger" style="grid-column:1/-1">
          <div class="load-more-spinner"></div>
          <p style="color:var(--text-muted);margin-top:12px">Searching MovieBox…</p>
        </div>
      </div>
    </div>
  `;

  try {
    const mbResult = await searchMovieBox(q, 'all');

    const grid = document.getElementById('search-results');
    if (!grid) return;
    grid.innerHTML = '';

    const mbItems = mbResult.results || [];

    if (mbItems.length) {
      grid.innerHTML += sectionHeader('MovieBox Results', mbItems.length, '🎬');
      
      const cards = mbItems.map(m => {
        const mapped = {
          id: `mb_${m.id || m.subjectId}`,
          title: m.title,
          poster_path: m.cover?.url || m.poster_path,
          vote_average: m.imdbRate || null,
          release_date: m.releaseDate || m.year,
        };
        return createMovieCard(mapped, m.subjectType === 2 ? 'tv' : 'movie');
      }).join('');
      
      grid.innerHTML += cards;
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;margin-top:var(--space-2xl)">
          <div class="empty-state-title">No results found</div>
          <div class="empty-state-text">We couldn't find anything matching "${q}".</div>
        </div>
      `;
    }

    attachCardClicks(grid);

  } catch (err) {
    console.error('Search error:', err);
    const grid = document.getElementById('search-results');
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;margin-top:var(--space-2xl)">
          <div class="empty-state-title">Search failed</div>
          <div class="empty-state-text">Could not connect to MovieBox. Please try again later.</div>
        </div>
      `;
    }
  }

  if (window.lucide) window.lucide.createIcons();
}
