// ========================================
// PlayerIQ — Detail Page
// ========================================

import { getMovieDetails, getTVDetails, getSeasonDetails, img, getWatchProviders } from '../services/api.js';
import { createContentRow, initContentRows } from '../components/ContentRow.js';
import { navigate } from '../services/router.js';
import { getUser } from '../services/auth.js';
import { isInWatchlist, addToWatchlist, removeFromWatchlist, addNotificationToCloud, removeNotificationFromCloud, isNotificationInCloud } from '../services/firebase.js';

export async function renderDetailPage({ params, container }) {
  const isTV = window.location.hash.includes('#/tv/');
  const id = params.id;

  container.innerHTML = `
    <div class="detail-page">
      <div class="detail-backdrop-container">
        <div style="width:100%;height:100%;background:var(--bg-secondary);animation:shimmer 2s infinite;background-size:200% 100%;background-image:linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);"></div>
      </div>
    </div>
  `;

  try {
    const data = isTV ? await getTVDetails(id) : await getMovieDetails(id);
    const title = data.title || data.name;
    const year = (data.release_date || data.first_air_date || '').slice(0, 4);
    const rating = data.vote_average?.toFixed(1) || '—';
    const runtime = data.runtime ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]}m/ep` : '');
    const similar = data.similar?.results?.slice(0, 12) || data.recommendations?.results?.slice(0, 12) || [];
    const type = isTV ? 'tv' : 'movie';

    let seasonsHTML = '';
    if (isTV && data.seasons?.length) {
      seasonsHTML = `
        <div class="detail-section">
          <h2 class="detail-section-title">Seasons & Episodes</h2>
          <div class="seasons-tabs" id="seasons-tabs">
            ${data.seasons.filter(s => s.season_number > 0).map((s, i) => `
              <button class="season-tab ${i === 0 ? 'active' : ''}" data-season="${s.season_number}">
                Season ${s.season_number}
              </button>
            `).join('')}
          </div>
          <div class="episode-list" id="episode-list">
            <div class="load-more-trigger"><div class="load-more-spinner"></div></div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="detail-page animate-fade-in">
        <div class="detail-backdrop-container">
          ${data.backdrop_path
            ? `<img class="detail-backdrop" src="${img.backdrop(data.backdrop_path, 'w1280')}" alt="${title}" />`
            : `<div class="detail-backdrop" style="background:var(--bg-secondary)"></div>`
          }
          <div class="detail-backdrop-overlay"></div>
          <div class="detail-backdrop-overlay-left"></div>
        </div>

        <div class="detail-main">
          <div class="detail-poster-wrapper">
            ${data.poster_path
              ? `<img class="detail-poster" src="${img.poster(data.poster_path, 'w500')}" alt="${title}" />`
              : `<div class="detail-poster" style="background:var(--bg-card);display:flex;align-items:center;justify-content:center;color:var(--text-dim)">No Poster</div>`
            }
          </div>
          <div class="detail-info">
            <h1 class="detail-title">${title}</h1>
            ${data.tagline ? `<p class="detail-tagline">"${data.tagline}"</p>` : ''}
            <div class="detail-meta">
              <span class="detail-rating">
                <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                ${rating}
              </span>
              <span class="detail-dot"></span>
              <span>${year}</span>
              ${runtime ? `<span class="detail-dot"></span><span>${runtime}</span>` : ''}
              ${isTV && data.number_of_seasons ? `<span class="detail-dot"></span><span>${data.number_of_seasons} Season${data.number_of_seasons > 1 ? 's' : ''}</span>` : ''}
            </div>
            <div class="detail-genres">
              ${(data.genres || []).map(g => `<span class="detail-genre-tag">${g.name}</span>`).join('')}
            </div>
            
            <!-- Watch Providers (Streaming Source) Badge -->
            <div id="watch-providers-container" style="display: none; margin: 15px 0 20px 0;">
              <span style="color: var(--text-dim); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; display: block; margin-bottom: 8px;">Streaming Source</span>
              <div id="watch-providers-list" style="display: flex; gap: 8px; flex-wrap: wrap;"></div>
            </div>

            <h3 class="detail-overview-title">Overview</h3>
            <p class="detail-overview">${data.overview || 'No overview available.'}</p>
            <div class="detail-actions">
              <button class="detail-btn detail-btn-primary" id="watch-btn">
                <i data-lucide="play" style="width:20px;height:20px"></i>
                Watch Now
              </button>
              <button class="detail-btn detail-btn-secondary" id="share-btn">
                <i data-lucide="share-2" style="width:18px;height:18px"></i>
                Share
              </button>
              <button class="detail-btn detail-btn-secondary detail-btn-watchlist" id="watchlist-btn">
                <i data-lucide="bookmark" style="width:18px;height:18px"></i>
                <span id="watchlist-btn-text">Watchlist</span>
              </button>
            </div>
          </div>
        </div>

        ${seasonsHTML}

        ${similar.length ? createContentRow('You May Also Like', similar, type) : ''}
        
        <div class="detail-modal" id="details-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; padding: 20px;">
          <div style="background: var(--bg-card); max-width: 600px; width: 100%; border-radius: 12px; padding: 24px; max-height: 80vh; overflow-y: auto; position: relative;">
            <button id="close-modal-btn" style="position: absolute; top: 16px; right: 16px; background: none; border: none; color: var(--text-muted); cursor: pointer;"><i data-lucide="x"></i></button>
            <h2 style="margin-top: 0; margin-bottom: 20px; font-size: 24px;">Extra Details</h2>
            <div id="details-modal-content" style="color: var(--text-dim); line-height: 1.6;"></div>
          </div>
        </div>
      </div>
    `;

    // Watch button
    document.getElementById('watch-btn')?.addEventListener('click', () => {
      if (isTV) {
        const seasonsSection = document.querySelector('.detail-section');
        if (seasonsSection) {
          seasonsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        navigate(`/watch/${type}/${id}`);
      }
    });

    // Share button
    document.getElementById('share-btn')?.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({ title, url: window.location.href });
      } else {
        navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
      }
    });

    // Watchlist button
    const watchlistBtn = document.getElementById('watchlist-btn');
    const watchlistBtnText = document.getElementById('watchlist-btn-text');
    const user = getUser();
    const mediaObj = {
      id,
      title,
      type: isTV ? 'tv' : 'movie',
      poster_path: data.poster_path ? img.poster(data.poster_path, 'w500') : null,
      backdrop_path: data.backdrop_path ? img.backdrop(data.backdrop_path, 'w780') : null,
      vote_average: data.vote_average
    };

    if (watchlistBtn && user) {
      // Check current state
      const inList = await isInWatchlist(user.uid, id);
      updateWatchlistBtn(watchlistBtn, watchlistBtnText, inList);

      watchlistBtn.addEventListener('click', async () => {
        const isNowIn = watchlistBtn.classList.contains('in-list');
        watchlistBtn.disabled = true;
        try {
          if (isNowIn) {
            await removeFromWatchlist(user.uid, id);
            updateWatchlistBtn(watchlistBtn, watchlistBtnText, false);
          } else {
            await addToWatchlist(user.uid, mediaObj);
            updateWatchlistBtn(watchlistBtn, watchlistBtnText, true);
          }
        } finally {
          watchlistBtn.disabled = false;
        }
      });
    } else if (watchlistBtn && !user) {
      watchlistBtn.addEventListener('click', () => navigate('/watchlist'));
    }

    // Details button modal
    document.getElementById('details-btn')?.addEventListener('click', () => {
      const modal = document.getElementById('details-modal');
      const content = document.getElementById('details-modal-content');
      if (modal && content && data.raw_data) {
        const d = data.raw_data;
        let html = '';
        if (d.aka) html += `<p><strong>Also Known As:</strong> ${d.aka}</p>`;
        if (d.countryName) html += `<p><strong>Country:</strong> ${d.countryName}</p>`;
        if (d.contentRating) html += `<p><strong>Rating:</strong> ${d.contentRating}</p>`;
        if (d.language) html += `<p><strong>Language:</strong> ${d.language}</p>`;
        if (d.dubs) html += `<p><strong>Dubs:</strong> ${Array.isArray(d.dubs) ? d.dubs.map(x => x.name || x).join(', ') : d.dubs}</p>`;
        if (d.subtitles) html += `<p><strong>Subtitles:</strong> ${Array.isArray(d.subtitles) ? d.subtitles.map(x => x.name || x).join(', ') : d.subtitles}</p>`;
        
        if (d.staffList && d.staffList.length > 0) {
          html += `<h3 style="margin-top: 20px; margin-bottom: 16px; color: var(--text-main);">Cast & Crew</h3>`;
          html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 16px; margin-top: 12px;">`;
          const fallbackImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23333' width='100' height='100'/%3E%3C/svg%3E";
          
          const staffMap = new Map();
          d.staffList.forEach(staff => {
            if (!staff.name) return;
            const role = staff.character || (staff.staffType === 1 ? 'Actor' : 'Director');
            if (staffMap.has(staff.name)) {
              const existing = staffMap.get(staff.name);
              if (!existing.character.includes(role)) {
                existing.character += `, ${role}`;
              }
            } else {
              staffMap.set(staff.name, { ...staff, character: role });
            }
          });

          Array.from(staffMap.values()).forEach(staff => {
            html += `
              <div style="text-align: center;">
                <img src="${staff.avatarUrl || fallbackImg}" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; margin-bottom: 8px;">
                <div style="font-size: 13px; font-weight: 500; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${staff.name || ''}">${staff.name || ''}</div>
                <div style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${staff.character}">${staff.character}</div>
              </div>
            `;
          });
          html += `</div>`;
        }
        
        content.innerHTML = html || 'No additional details available.';
        modal.style.display = 'flex';
      }
    });

    document.getElementById('close-modal-btn')?.addEventListener('click', () => {
      document.getElementById('details-modal').style.display = 'none';
    });

    // Season tabs
    if (isTV && data.seasons?.length) {
      const firstSeason = data.seasons.find(s => s.season_number > 0);
      const cleanTitle = title.replace(/\[.*?\]/g, '').trim();
      if (firstSeason) loadEpisodes(id, firstSeason.season_number, cleanTitle, year);

      document.querySelectorAll('.season-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.season-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          loadEpisodes(id, parseInt(tab.dataset.season), cleanTitle, year);
        });
      });
    }

    // Load and render Watch Providers (Streaming Source)
    const cleanTitle = title.replace(/\[.*?\]/g, '').trim();
    getWatchProviders(id, type, cleanTitle).then(providers => {
      const provContainer = document.getElementById('watch-providers-container');
      const provList = document.getElementById('watch-providers-list');
      if (provContainer && provList && providers) {
        const list = [...(providers.flatrate || []), ...(providers.buy || []), ...(providers.rent || [])];
        const unique = [];
        const seen = new Set();
        for (const p of list) {
          if (!seen.has(p.provider_id)) {
            seen.add(p.provider_id);
            unique.push(p);
          }
        }
        
        if (unique.length > 0) {
          provList.innerHTML = unique.map(p => `
            <div class="provider-badge" style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; color: #fff;">
              <img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}" style="width: 18px; height: 18px; border-radius: 4px;" />
              <span>${p.provider_name}</span>
            </div>
          `).join('');
          provContainer.style.display = 'block';
        }
      }
    }).catch(err => {
      console.warn('Failed to load watch providers:', err);
    });

    initContentRows(container);
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('Detail page error:', err);
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div class="empty-state-title">Failed to load</div>
        <div class="empty-state-text">Could not load details. Please try again.</div>
      </div>
    `;
  }
}

async function loadEpisodes(tvId, seasonNumber, title = null, year = null) {
  const listEl = document.getElementById('episode-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="load-more-trigger"><div class="load-more-spinner"></div></div>';

  try {
    const season = await getSeasonDetails(tvId, seasonNumber, title, year);
    const todayStr = new Date().toISOString().slice(0, 10);

    const episodesHTML = (season.episodes || []).map(ep => {
      const isUnaired = !ep.air_date || ep.air_date > todayStr;
      const formattedDate = ep.air_date ? new Date(ep.air_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Soon';
      const epKey = `${tvId}_S${seasonNumber}_E${ep.episode_number}`;

      const cardClass = isUnaired ? 'episode-card unaired' : 'episode-card';
      const routeStr = isUnaired ? '' : `data-route="/watch/tv/${tvId}?s=${seasonNumber}&e=${ep.episode_number}"`;

      return `
        <div class="${cardClass}" ${routeStr}>
          <div class="episode-still-container">
            <img src="${ep.still_path ? img.still(ep.still_path) : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect fill="%231a1a2e" width="320" height="180"/><text x="160" y="95" text-anchor="middle" fill="%234a4a5e" font-size="14">No Image</text></svg>')}" alt="Episode ${ep.episode_number}" loading="lazy" />
            ${isUnaired ? `
              <div class="episode-lock-overlay">
                <i data-lucide="lock"></i>
              </div>
            ` : ''}
          </div>
          <div class="episode-info">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div class="episode-number">
                Episode ${ep.episode_number}
                ${isUnaired ? `<span style="color:#00a8e1; font-weight:700; margin-left:8px; font-size:11px;">Coming ${formattedDate}</span>` : ''}
              </div>
            </div>
            <div class="episode-name">${ep.name || ''}</div>
            <div class="episode-overview">${ep.overview || 'No description available.'}</div>
            
            ${isUnaired ? `
              <button class="notify-btn" data-ep-key="${epKey}" data-title="${ep.name || ''}" data-airdate="${ep.air_date || 'Soon'}">
                <i data-lucide="bell" style="width: 14px; height: 14px;"></i>
                <span>Notify Me</span>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = episodesHTML;
    if (window.lucide) window.lucide.createIcons();

    // Setup toggle indicators
    listEl.querySelectorAll('.notify-btn').forEach(btn => {
      const epKey = btn.dataset.epKey;
      const titleStr = btn.dataset.title;
      const airdateStr = btn.dataset.airdate;
      const user = getUser();

      // Check if already notified
      const alerts = JSON.parse(localStorage.getItem('playeriq_notify_episodes') || '{}');
      if (alerts[epKey]) {
        btn.classList.add('active');
        btn.innerHTML = `<i data-lucide="bell-ring" style="width: 14px; height: 14px; fill: #00a8e1;"></i> <span>Notified</span>`;
        if (window.lucide) window.lucide.createIcons();
      }

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentAlerts = JSON.parse(localStorage.getItem('playeriq_notify_episodes') || '{}');
        const isActive = btn.classList.contains('active');

        if (isActive) {
          delete currentAlerts[epKey];
          localStorage.setItem('playeriq_notify_episodes', JSON.stringify(currentAlerts));
          btn.classList.remove('active');
          btn.innerHTML = `<i data-lucide="bell" style="width: 14px; height: 14px;"></i> <span>Notify Me</span>`;
          
          if (user) {
            await removeNotificationFromCloud(user.uid, epKey);
          }
          showToast('Notification alert removed.', 'bell-off');
        } else {
          // Request browser push notification permission if default
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }

          const notif = {
            epKey,
            tvId,
            seasonNumber,
            episodeNumber: String(epKey.split('_E')[1]),
            title: titleStr,
            airDate: airdateStr
          };
          currentAlerts[epKey] = notif;
          localStorage.setItem('playeriq_notify_episodes', JSON.stringify(currentAlerts));
          btn.classList.add('active');
          btn.innerHTML = `<i data-lucide="bell-ring" style="width: 14px; height: 14px; fill: #00a8e1;"></i> <span>Notified</span>`;
          
          if (user) {
            await addNotificationToCloud(user.uid, notif);
          }
          showToast(`Alert set! We will notify you when Episode ${notif.episodeNumber} airs.`, 'bell');
        }
        if (window.lucide) window.lucide.createIcons();
      });
    });

    listEl.querySelectorAll('.episode-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.notify-btn')) {
          e.stopPropagation();
          return;
        }

        if (card.classList.contains('unaired')) {
          showToast('This episode has not aired yet.', 'calendar');
          return;
        }

        const route = card.dataset.route;
        if (route) window.location.hash = route;
      });
    });

  } catch (err) {
    listEl.innerHTML = '<p style="color:var(--text-muted);padding:var(--space-md)">Failed to load episodes.</p>';
  }
}

function showToast(message, iconName = 'bell') {
  let container = document.getElementById('piq-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'piq-toast-container';
    container.className = 'piq-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'piq-toast';
  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => toast.classList.add('show'), 50);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function updateWatchlistBtn(btn, textEl, inList) {
  if (inList) {
    btn.classList.add('in-list');
    if (textEl) textEl.textContent = 'Saved';
    const icon = btn.querySelector('i[data-lucide]');
    if (icon) { icon.setAttribute('data-lucide', 'bookmark-check'); if (window.lucide) window.lucide.createIcons(); }
  } else {
    btn.classList.remove('in-list');
    if (textEl) textEl.textContent = 'Watchlist';
    const icon = btn.querySelector('i[data-lucide]');
    if (icon) { icon.setAttribute('data-lucide', 'bookmark'); if (window.lucide) window.lucide.createIcons(); }
  }
}

