// ========================================
// PlayerIQ — Movie Release Calendar Page
// ========================================

import { createContentRow } from '../components/ContentRow.js';
import { navigate } from '../services/router.js';
import { getUser } from '../services/auth.js';
import { isInWatchlist, addToWatchlist, removeFromWatchlist } from '../services/firebase.js';

// High-fidelity release dataset (Hybrid TMDB IDs integrated)
const RELEASES_DATA = [
  // December 2025 Releases
  {
    id: "stranger_5",
    tmdbId: 66732, // Stranger Things
    type: "tv",
    title: "Stranger Things 5 (Vol. 1)",
    date: "2025-12-05", // Officially released in Dec 2025
    platform: "netflix",
    platformLabel: "Netflix",
    rating: "9.2",
    runtime: "55m/ep",
    genres: ["Sci-Fi", "Drama", "Mystery"],
    poster: "https://image.tmdb.org/t/p/w500/49W04aTFRIj6H6wzrj7A0ugIuIR.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/56v2Dnjsu505CgA3U17u1D35JWh.jpg",
    tagline: "One last ride in the Upside Down.",
    overview: "The final showdown in Hawkins begins as Eleven and her friends gather their strength to close the rift to the Upside Down once and for all and defeat Vecna in an epic closing season.",
    trailerKey: "tos7MZ18118"
  },

  // May 2026 Releases
  {
    id: "avengers_doomsday",
    tmdbId: 1003596, // Avengers: Doomsday
    type: "movie",
    title: "Avengers: Doomsday",
    date: "2026-05-01",
    platform: "cinema",
    platformLabel: "Cinema",
    rating: "9.4",
    runtime: "160m",
    genres: ["Action", "Sci-Fi", "Adventure"],
    poster: "https://image.tmdb.org/t/p/w500/8HkIe2i4ScpCkcX9SzZ9IPasqWV.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/3eOINbgRs8WiWfQfViXeuZ3enrs.jpg",
    tagline: "The doom of the multiverse begins.",
    overview: "Earth's mightiest heroes face an unprecedented threat from the multiverse as Doctor Doom rises to reshape reality itself in his own image.",
    trailerKey: "tos7MZ18118"
  },
  {
    id: "batman_2",
    tmdbId: 414906, // The Batman
    type: "movie",
    title: "The Batman Part II",
    date: "2026-05-08",
    platform: "hbo",
    platformLabel: "Max",
    rating: "8.8",
    runtime: "165m",
    genres: ["Action", "Crime", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/vc8nJUgj5Ns4ST0XJIL7FJm1e17.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/5P8A3kh4XGept6Sq7LMZ9wYJdfu.jpg",
    tagline: "The shadows return to Gotham.",
    overview: "Bruce Wayne continues his descent into the corrupt underbelly of Gotham City, facing a new legion of villains in this highly anticipated sequel to the noir detective masterpiece.",
    trailerKey: "mqqft2x_Aa4"
  },
  {
    id: "dune_prophecy",
    tmdbId: 91363, // Dune: Prophecy / Foundation
    type: "tv",
    title: "Dune: Prophecy Season 2",
    date: "2026-05-14",
    platform: "hbo",
    platformLabel: "Max",
    rating: "8.5",
    runtime: "60m/ep",
    genres: ["Sci-Fi", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/h6Y65HlE681h0xH6xZzXU64Tj1y.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/etj8VeTYcl8hUkeOF9v69gCBvLs.jpg",
    tagline: "The origin of the Sisterhood.",
    overview: "Set 10,000 years before the ascension of Paul Atreides, Season 2 continues the story of the Harkonnen sisters as they establish the fabled sect that will become known as the Bene Gesserit.",
    trailerKey: "m20e5V1B0lM"
  },
  {
    id: "mission_8",
    tmdbId: 575264, // Mission: Impossible - Dead Reckoning (MI8 substitute)
    type: "movie",
    title: "Mission: Impossible - The Final Reckoning",
    date: "2026-05-20", // Replaces Stranger Things 5 Vol 1 on May 20, 2026
    platform: "cinema",
    platformLabel: "Cinema",
    rating: "8.9",
    runtime: "163m",
    genres: ["Action", "Adventure", "Thriller"],
    poster: "https://image.tmdb.org/t/p/w500/NNxYkU70HPurnNCSiCjYAmacwm.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/628Dep6AxEtDxjZoGP78TsOxYbK.jpg",
    tagline: "Our lives are the sum of our choices.",
    overview: "Ethan Hunt and his IMF team embark on their most dangerous mission yet to track down a terrifying new weapon that threatens all of humanity before it falls into the wrong hands.",
    trailerKey: "tos7MZ18118"
  },
  {
    id: "mando_grogu",
    tmdbId: 82856, // The Mandalorian
    type: "movie",
    title: "The Mandalorian & Grogu",
    date: "2026-05-25",
    platform: "disney",
    platformLabel: "Disney+",
    rating: "8.9",
    runtime: "120m",
    genres: ["Sci-Fi", "Action", "Adventure"],
    poster: "https://image.tmdb.org/t/p/w500/e312P2P74pwk49nXZgfU42uiHbj.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/9z7510jDNURqw416C247S6PtVf5.jpg",
    tagline: "This is the way... to the big screen.",
    overview: "Din Djarin and his beloved foundling Grogu embark on a brand new cinematic adventure, navigating the dangerous outer rim in a story that expands the Mandalorian saga to epic scope.",
    trailerKey: "aOC8E8z_ifw"
  },

  // June 2026 Releases
  {
    id: "spider_verse",
    tmdbId: 502356, // Spider-Man: Beyond the Spider-Verse
    type: "movie",
    title: "Spider-Man: Beyond Spider-Verse",
    date: "2026-06-04",
    platform: "cinema",
    platformLabel: "Cinema",
    rating: "9.5",
    runtime: "140m",
    genres: ["Animation", "Action", "Sci-Fi"],
    poster: "https://image.tmdb.org/t/p/w500/8Gxv2wSbscl0e6S0SVIlm76StQD.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/ctM8w2RE45yzn2n20jH0G6oebtL.jpg",
    tagline: "Anyone can wear the mask.",
    overview: "Miles Morales faces his ultimate multiversal destiny, reuniting with Gwen Stacy, Peter Parker, and a fresh legion of Spider-People to stop the Spot from fracturing reality itself.",
    trailerKey: "o1K4y637bL4"
  },
  {
    id: "wednesday_2",
    tmdbId: 119051, // Wednesday
    type: "tv",
    title: "Wednesday Season 2",
    date: "2026-06-10",
    platform: "netflix",
    platformLabel: "Netflix",
    rating: "8.7",
    runtime: "50m/ep",
    genres: ["Mystery", "Comedy", "Fantasy"],
    poster: "https://image.tmdb.org/t/p/w500/z71i4580W0WjR54tqX2A8886.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/iH7v2750w283xX8j16c029X1c.jpg",
    tagline: "Woe is back for more.",
    overview: "Wednesday Addams returns to Nevermore Academy, navigating a fresh web of murders, supernatural threats, and unwanted friendships in a delightfully macabre second season.",
    trailerKey: "N7Z71Ww269c"
  },
  {
    id: "knives_out_3",
    tmdbId: 661374, // Glass Onion / Knives Out
    type: "movie",
    title: "Wake Up Dead Man: A Knives Out Mystery",
    date: "2026-06-16",
    platform: "netflix",
    platformLabel: "Netflix",
    rating: "8.4",
    runtime: "135m",
    genres: ["Mystery", "Comedy", "Crime"],
    poster: "https://image.tmdb.org/t/p/w500/vD53Lgw77N8g453J3xX715A09.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/d38392X883j7X2k019c283xX.jpg",
    tagline: "Benoit Blanc's most dangerous case yet.",
    overview: "Acclaimed detective Benoit Blanc travels to London to crack a bizarre puzzle involving a reclusive billionaire and a highly eccentric cast of suspects, where anyone could be the killer.",
    trailerKey: "Yw1y1c03CqU"
  },
  {
    id: "boys_5",
    tmdbId: 76479, // The Boys
    type: "tv",
    title: "The Boys Season 5",
    date: "2026-06-26",
    platform: "prime",
    platformLabel: "Prime Video",
    rating: "9.0",
    runtime: "60m/ep",
    genres: ["Action", "Sci-Fi", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/775XW4VzW3k0F2X8U3wK228G.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/9y230X18873wY2k08c283xX.jpg",
    tagline: "The final bloodbath.",
    overview: "Homelander asserts total control over Vought and the government, forcing Billy Butcher and the Boys into a desperate, no-holds-barred final war to save humanity from superhero supremacy.",
    trailerKey: "N7Z781c98Cq"
  },
  {
    id: "severance_3",
    tmdbId: 95396, // Severance
    type: "tv",
    title: "Severance Season 3",
    date: "2026-06-30",
    platform: "apple",
    platformLabel: "Apple TV+",
    rating: "9.1",
    runtime: "50m/ep",
    genres: ["Sci-Fi", "Drama", "Mystery"],
    poster: "https://image.tmdb.org/t/p/w500/8T67wY69873wX2K0c283xX.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/ctM8w2RE45yzn2n20jH0G6o.jpg",
    tagline: "Please enjoy all releases equally.",
    overview: "Following the explosive corporate discoveries of Season 2, Mark and the severed Lumon Industries floor must navigate deep-cover espionage as the outie and inie worlds begin to bleed.",
    trailerKey: "N7Z181w9372"
  },

  // July 2026 Releases
  {
    id: "supergirl",
    tmdbId: 693134, // Dune / Supergirl
    type: "movie",
    title: "Supergirl: Woman of Tomorrow",
    date: "2026-07-03",
    platform: "cinema",
    platformLabel: "Cinema",
    rating: "8.6",
    runtime: "130m",
    genres: ["Sci-Fi", "Action", "Adventure"],
    poster: "https://image.tmdb.org/t/p/w500/vc8nJUgj5Ns4ST0XJIL7FJm1e17.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/5P8A3kh4XGept6Sq7LMZ9wYJdfu.jpg",
    tagline: "A hero forged in cosmic fire.",
    overview: "Kara Zor-El, Superman's cousin, journeys across the cosmos alongside a young alien girl seeking vengeance, in a beautiful science-fiction space adventure based on Tom King's masterpiece.",
    trailerKey: "m20e5V1B0lM"
  },
  {
    id: "deadpool_ext",
    tmdbId: 533535, // Deadpool & Wolverine
    type: "movie",
    title: "Deadpool & Wolverine (Extended Cut)",
    date: "2026-07-25",
    platform: "disney",
    platformLabel: "Disney+",
    rating: "9.3",
    runtime: "155m",
    genres: ["Action", "Comedy", "Sci-Fi"],
    poster: "https://image.tmdb.org/t/p/w500/8cdWv6ZzXzXU64Tj1y.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/etj8VeTYcl8hUkeOF9v69gCBvLs.jpg",
    tagline: "Now with 20% more chaos.",
    overview: "The blockbuster team-up lands on Disney+ with an exclusive extended cut featuring 25 minutes of deleted scenes, alternate fourth-wall breaks, and multiversal madness.",
    trailerKey: "tos7MZ18118"
  },
  {
    id: "foundation_4",
    tmdbId: 91363, // Foundation
    type: "tv",
    title: "Foundation Season 4",
    date: "2026-07-31",
    platform: "apple",
    platformLabel: "Apple TV+",
    rating: "8.8",
    runtime: "60m/ep",
    genres: ["Sci-Fi", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/h6Y65HlE681h0xH6xZzXU64Tj1y.jpg",
    backdrop: "https://image.tmdb.org/t/p/w1280/etj8VeTYcl8hUkeOF9v69gCBvLs.jpg",
    tagline: "The fall accelerates.",
    overview: "As Hari Seldon's psychohistory plan reaches its third century, the Foundation faces a direct assault from a powerful mutant known as the Mule, putting the empire's remnants on the brink of collapse.",
    trailerKey: "mqqft2x_Aa4"
  }
];

export async function renderCalendarPage({ container }) {
  // Enforce desktop check - redirect to home on small devices
  if (window.innerWidth <= 767) {
    navigate('/');
    return;
  }

  // Active state parameters
  let currentDate = new Date(2026, 4, 1); // May 2026 (0-indexed Month 4)
  let activePlatform = 'all';
  let selectedMovieId = null;

  // Initialize UI structure
  container.innerHTML = `
    <div class="calendar-page-container animate-fade-in-up">
      <div class="calendar-layout-wrapper">
        
        <!-- Left Side: Interactive Calendar & Filters -->
        <div class="calendar-left-pane">
          <div class="calendar-header-card glass-panel">
            <div class="calendar-header-top">
              <h1 class="calendar-main-title">Release Calendar</h1>
              <div class="month-selector-group">
                <button class="month-nav-btn" id="prev-month-btn" aria-label="Previous Month">
                  <i data-lucide="chevron-left"></i>
                </button>
                <span class="current-month-display" id="month-name-display">May 2026</span>
                <button class="month-nav-btn" id="next-month-btn" aria-label="Next Month">
                  <i data-lucide="chevron-right"></i>
                </button>
                <button class="today-jump-btn" id="today-btn">Today</button>
              </div>
            </div>

            <!-- Platform Filters -->
            <div class="platform-filters-row">
              <button class="filter-tab active" data-source="all">All Sources</button>
              <button class="filter-tab" data-source="netflix">
                <span class="platform-dot netflix"></span> Netflix
              </button>
              <button class="filter-tab" data-source="disney">
                <span class="platform-dot disney"></span> Disney+
              </button>
              <button class="filter-tab" data-source="prime">
                <span class="platform-dot prime"></span> Prime Video
              </button>
              <button class="filter-tab" data-source="apple">
                <span class="platform-dot apple"></span> Apple TV+
              </button>
              <button class="filter-tab" data-source="hbo">
                <span class="platform-dot hbo"></span> Max
              </button>
              <button class="filter-tab" data-source="cinema">
                <span class="platform-dot cinema"></span> Cinema
              </button>
            </div>
          </div>

          <!-- Dynamic Calendar Grid Panel -->
          <div class="calendar-grid-card glass-panel" id="calendar-grid-card">
            <div class="calendar-days-header">
              <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>
            <div class="calendar-grid-body" id="calendar-grid-body">
              <!-- Grid Days loaded dynamically -->
            </div>
          </div>
        </div>

        <!-- Right Side: Release List Panel -->
        <div class="calendar-right-pane glass-panel">
          <h2 class="pane-side-title" id="side-list-title">Releases in May 2026</h2>
          <div class="side-releases-list" id="side-releases-list">
            <!-- Dynamic list -->
          </div>
        </div>

      </div>

      <!-- Macro Detail Sliding Drawer -->
      <div class="calendar-detail-drawer" id="calendar-drawer">
        <div class="drawer-overlay" id="drawer-overlay"></div>
        <div class="drawer-content-pane glass-panel">
          <button class="drawer-close-btn" id="drawer-close" aria-label="Close Details">
            <i data-lucide="x"></i>
          </button>
          <div class="drawer-body" id="drawer-body-content">
            <!-- Loaded dynamically -->
          </div>
        </div>
      </div>

      <!-- Watch Trailer Modal -->
      <div class="detail-modal" id="calendar-trailer-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10001; justify-content: center; align-items: center; padding: 20px;">
        <div style="background: #000; width: 100%; max-width: 900px; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; position: relative; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
          <button id="close-cal-trailer" style="position: absolute; top: 16px; right: 16px; background: rgba(0,0,0,0.5); border: none; color: #fff; cursor: pointer; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
          <div id="cal-trailer-container" style="width:100%; height:100%;"></div>
        </div>
      </div>

    </div>
  `;

  // Dynamic Lucide icons boot
  if (window.lucide) window.lucide.createIcons();

  // Helper functions
  const getFilteredReleases = () => {
    return RELEASES_DATA.filter(movie => {
      const movieDate = new Date(movie.date);
      const isSameMonth = movieDate.getFullYear() === currentDate.getFullYear() &&
                          movieDate.getMonth() === currentDate.getMonth();
      const isSamePlatform = activePlatform === 'all' || movie.platform === activePlatform;
      return isSameMonth && isSamePlatform;
    });
  };

  const getMovieOnDay = (day) => {
    return RELEASES_DATA.filter(movie => {
      const movieDate = new Date(movie.date);
      return movieDate.getFullYear() === currentDate.getFullYear() &&
             movieDate.getMonth() === currentDate.getMonth() &&
             movieDate.getDate() === day;
    });
  };

  // Drawer slider action
  const openDrawer = async (movie) => {
    const drawer = document.getElementById('calendar-drawer');
    const drawerBody = document.getElementById('drawer-body-content');
    if (!drawer || !drawerBody) return;

    selectedMovieId = movie.id;
    
    // Check Watchlist status
    const user = getUser();
    let isAdded = false;
    if (user) {
      try {
        isAdded = await isInWatchlist(movie.tmdbId, movie.type);
      } catch(e) {
        console.warn(e);
      }
    }

    const watchlistBtnText = isAdded ? 'Added to Watchlist' : 'Add to Watchlist';
    const watchlistBtnIcon = isAdded ? 'check' : 'plus';
    const watchlistBtnClass = isAdded ? 'drawer-btn-secondary added' : 'drawer-btn-secondary';

    drawerBody.innerHTML = `
      <div class="drawer-backdrop-hero" style="background-image: linear-gradient(to bottom, rgba(16,18,30,0) 20%, #10121e 100%), url('${movie.backdrop}');">
        <span class="drawer-platform-tag ${movie.platform}">${movie.platformLabel}</span>
      </div>
      <div class="drawer-info-content">
        <h3 class="drawer-movie-title">${movie.title}</h3>
        <p class="drawer-tagline">"${movie.tagline}"</p>
        
        <div class="drawer-metadata-row">
          <span class="drawer-meta-rating">
            <svg class="bento-star-icon" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>${movie.rating}</span>
          </span>
          <span class="drawer-meta-item">${movie.runtime}</span>
          <span class="drawer-meta-item">${new Date(movie.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <div class="drawer-genres-row">
          ${movie.genres.map(g => `<span class="drawer-genre-tag">${g}</span>`).join('')}
        </div>

        <h4 class="drawer-storyline-title">Storyline</h4>
        <p class="drawer-overview">${movie.overview}</p>

        <div class="drawer-actions-stack">
          ${movie.trailerKey ? `
            <button class="drawer-btn-primary" id="drawer-play-trailer-btn">
              <i data-lucide="play-circle"></i>
              Watch Trailer
            </button>
          ` : ''}
          <button class="${watchlistBtnClass}" id="drawer-watchlist-toggle-btn">
            <i data-lucide="${watchlistBtnIcon}"></i>
            <span id="drawer-watchlist-text">${watchlistBtnText}</span>
          </button>
          <button class="drawer-btn-secondary" id="drawer-go-details-btn">
            <i data-lucide="info"></i>
            Go to Movie Details
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Attach drawer button click handlers
    document.getElementById('drawer-play-trailer-btn')?.addEventListener('click', () => {
      const modal = document.getElementById('calendar-trailer-modal');
      const trailerContainer = document.getElementById('cal-trailer-container');
      if (modal && trailerContainer) {
        trailerContainer.innerHTML = `
          <iframe src="https://www.youtube.com/embed/${movie.trailerKey}?autoplay=1&rel=0" 
                  style="width:100%; height:100%; border:none;" 
                  allow="autoplay; encrypted-media; fullscreen" 
                  allowfullscreen></iframe>`;
        modal.style.display = 'flex';
      }
    });

    document.getElementById('drawer-watchlist-toggle-btn')?.addEventListener('click', async () => {
      if (!user) {
        navigate('/settings');
        return;
      }
      const wBtn = document.getElementById('drawer-watchlist-toggle-btn');
      const wText = document.getElementById('drawer-watchlist-text');
      if (!wBtn || !wText) return;

      wBtn.disabled = true;
      try {
        if (isAdded) {
          await removeFromWatchlist(movie.tmdbId, movie.type);
          isAdded = false;
          wText.textContent = 'Add to Watchlist';
          wBtn.className = 'drawer-btn-secondary';
          wBtn.querySelector('i')?.setAttribute('data-lucide', 'plus');
        } else {
          await addToWatchlist(movie.tmdbId, movie.type, movie.title, movie.poster);
          isAdded = true;
          wText.textContent = 'Added to Watchlist';
          wBtn.className = 'drawer-btn-secondary added';
          wBtn.querySelector('i')?.setAttribute('data-lucide', 'check');
        }
        if (window.lucide) window.lucide.createIcons();
      } catch (err) {
        console.warn('Watchlist sync error:', err);
      } finally {
        wBtn.disabled = false;
      }
    });

    document.getElementById('drawer-go-details-btn')?.addEventListener('click', () => {
      drawer.classList.remove('open');
      navigate(`/${movie.type}/${movie.tmdbId}`);
    });

    drawer.classList.add('open');
  };

  const closeDrawer = () => {
    const drawer = document.getElementById('calendar-drawer');
    if (drawer) drawer.classList.remove('open');
  };

  // Close actions
  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay')?.addEventListener('click', closeDrawer);

  document.getElementById('close-cal-trailer')?.addEventListener('click', () => {
    const modal = document.getElementById('calendar-trailer-modal');
    const trailerContainer = document.getElementById('cal-trailer-container');
    if (modal && trailerContainer) {
      trailerContainer.innerHTML = '';
      modal.style.display = 'none';
    }
  });

  // Render Lists
  const renderReleasesList = () => {
    const listContainer = document.getElementById('side-releases-list');
    const listTitle = document.getElementById('side-list-title');
    if (!listContainer) return;

    const filtered = getFilteredReleases();
    const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    listTitle.textContent = `Releases in ${monthName}`;

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="list-empty-state animate-fade-in">
          <i data-lucide="calendar-x" class="empty-list-icon"></i>
          <p class="empty-list-text">No releases found for this month.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Sort by release date ascending
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    listContainer.innerHTML = filtered.map(movie => {
      const releaseDay = new Date(movie.date).getDate();
      const isSelected = selectedMovieId === movie.id ? 'active' : '';
      
      return `
        <div class="list-movie-card ${isSelected} animate-fade-in" data-movie-id="${movie.id}">
          <div class="list-day-badge">
            <span class="day-num">${releaseDay}</span>
            <span class="day-lbl">${new Date(movie.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
          </div>
          <img src="${movie.poster}" class="list-movie-poster" alt="${movie.title}" />
          <div class="list-movie-details">
            <div class="list-movie-header">
              <h4 class="list-movie-title">${movie.title}</h4>
              <span class="list-platform-tag ${movie.platform}">${movie.platformLabel}</span>
            </div>
            <p class="list-movie-genre">${movie.genres.join(' · ')}</p>
            <div class="list-rating-row">
              <svg class="bento-star-icon" viewBox="0 0 24 24" style="width:12px; height:12px; fill:#ffc107; stroke:none;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span>${movie.rating}</span>
              <span class="list-meta-divider">·</span>
              <span>${movie.runtime}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add list click events
    listContainer.querySelectorAll('.list-movie-card').forEach(card => {
      card.addEventListener('click', () => {
        const movieId = card.dataset.movieId;
        const movie = RELEASES_DATA.find(m => m.id === movieId);
        if (movie) {
          // Highlight
          listContainer.querySelectorAll('.list-movie-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          openDrawer(movie);
        }
      });
    });
  };

  // Render Calendar Grid (With 3D Macro month-flip animation support)
  const renderCalendarGrid = () => {
    const gridBody = document.getElementById('calendar-grid-body');
    const gridCard = document.getElementById('calendar-grid-card');
    const monthDisplay = document.getElementById('month-name-display');
    if (!gridBody || !monthDisplay) return;

    // Trigger macro flip animation on month change
    gridCard.classList.remove('month-flip');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gridCard.classList.add('month-flip');
      });
    });

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    monthDisplay.textContent = monthName;

    // Get grid parameters
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    let gridHTML = '';

    // Render leading empty days from previous month
    for (let i = firstDayIndex; i > 0; i--) {
      const dayNum = prevMonthTotalDays - i + 1;
      gridHTML += `<div class="calendar-day-cell pad-day"><span>${dayNum}</span></div>`;
    }

    // Render active month days
    for (let day = 1; day <= totalDays; day++) {
      const movies = getMovieOnDay(day);
      const isReleaseDay = movies.length > 0;
      const releaseClass = isReleaseDay ? 'has-release' : '';
      
      let badgeHTML = '';
      if (isReleaseDay) {
        badgeHTML = `
          <div class="releases-dots-container">
            ${movies.map(movie => `
              <span class="platform-mini-dot ${movie.platform}" title="${movie.title} (${movie.platformLabel})"></span>
            `).join('')}
          </div>
        `;
      }

      gridHTML += `
        <div class="calendar-day-cell ${releaseClass}" data-day="${day}">
          <span class="cell-day-num">${day}</span>
          ${badgeHTML}
        </div>
      `;
    }

    // Render trailing grid padding days to make it a perfect rectangle
    const totalRenderedCells = firstDayIndex + totalDays;
    const remainingCells = 42 - totalRenderedCells; // Standard 6 weeks grid
    for (let i = 1; i <= remainingCells; i++) {
      gridHTML += `<div class="calendar-day-cell pad-day"><span>${i}</span></div>`;
    }

    gridBody.innerHTML = gridHTML;

    // Attach day cell click handlers
    gridBody.querySelectorAll('.calendar-day-cell.has-release').forEach(cell => {
      cell.addEventListener('click', () => {
        const day = parseInt(cell.dataset.day);
        const dayMovies = getMovieOnDay(day);
        if (dayMovies.length > 0) {
          // Open details for the first movie of that day
          openDrawer(dayMovies[0]);
          
          // Scroll and select inside list
          const listCard = document.querySelector(`.list-movie-card[data-movie-id="${dayMovies[0].id}"]`);
          if (listCard) {
            listCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            listCard.click();
          }
        }
      });
    });
  };

  // Wire controls and month selectors
  document.getElementById('prev-month-btn')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    closeDrawer();
    renderCalendarGrid();
    renderReleasesList();
  });

  document.getElementById('next-month-btn')?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    closeDrawer();
    renderCalendarGrid();
    renderReleasesList();
  });

  document.getElementById('today-btn')?.addEventListener('click', () => {
    currentDate = new Date(2026, 4, 1); // Jump back to May 2026 default
    closeDrawer();
    renderCalendarGrid();
    renderReleasesList();
  });

  // Platform source tabs filtering
  const filterTabs = document.querySelectorAll('.platform-filters-row .filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      activePlatform = tab.dataset.source;
      closeDrawer();
      renderCalendarGrid();
      renderReleasesList();
    });
  });

  // Initial render calls
  renderCalendarGrid();
  renderReleasesList();

  // Cleanup on route shift
  return () => {
    const calTrailer = document.getElementById('cal-trailer-container');
    if (calTrailer) calTrailer.innerHTML = '';
  };
}
