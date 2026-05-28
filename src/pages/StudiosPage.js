// ========================================
// PlayerIQ — Studios Directory Page (Mobile)
// ========================================

import { navigate } from '../services/router.js';
import { createFooter } from '../components/Footer.js';

export async function renderStudiosPage({ container }) {
  // 12 Registered Brand Studios List
  const studiosList = [
    { name: 'Disney+', route: '/category?title=Disney%2B', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg' },
    { name: 'Netflix', route: '/category?title=Netflix', logo: 'https://www.vectorlogo.zone/logos/netflix/netflix-ar21.svg' },
    { name: 'Prime Video', route: '/category?title=Amazon%20Prime%20Video', logo: 'https://image.tmdb.org/t/p/original/f311cuuS7HK38HYgcYl0rXQrKvv.png' },
    { name: 'Marvel', route: '/category?title=Marvel', logo: '/marvel-logo-white.svg' },
    { name: 'HBO Max', route: '/category?title=HBO%20Max', logo: 'https://image.tmdb.org/t/p/original/tuomPhY2UtuPTqqFnKMVHvSb724.png' },
    { name: 'Paramount+', route: '/category?title=Paramount%2B', logo: 'https://image.tmdb.org/t/p/original/jay6WcMgagAklUt7i9Euwj1pzTF.png' },
    { name: 'DC Studios', route: '/category?title=DC%20Studios', logo: '/dc-studios-tmdb.png' },
    { name: 'Warner Bros', route: '/category?title=Warner%20Bros', logo: '/wb-official.svg' },
    { name: 'Universal', route: '/category?title=Universal%20Pictures', logo: '/universal-tmdb.png' },
    { name: 'Sony Pictures', route: '/category?title=Sony%20Pictures', logo: '/sony-tmdb.png' },
    { name: 'Apple TV+', route: '/category?title=Apple%20TV%2B', logo: '/appletv-tmdb.png' },
    { name: 'DreamWorks', route: '/category?title=DreamWorks', logo: '/dreamworks-tmdb.png' }
  ];

  const gridHTML = studiosList.map(studio => {
    // Determine custom class or layout fixes for specific logos if needed
    const nameSlug = studio.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `
      <div class="studio-circle-card" data-route="${studio.route}">
        <div class="studio-circle-bubble studio-circle-${nameSlug}">
          <img class="studio-circle-logo" src="${studio.logo}" alt="${studio.name}" loading="lazy" />
        </div>
        <div class="studio-circle-label">${studio.name}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="studios-page-container">
      <div class="studios-header-wrapper">
        <button class="studios-back-btn" id="studios-back-button" aria-label="Go back">
          <i data-lucide="chevron-left" style="width:20px;height:20px;margin-right:2px;"></i>
        </button>
        <h1 style="font-size: 22px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="clapperboard" style="color:var(--accent, #A020F0); width:22px; height:22px;"></i>
          Featured Studios
        </h1>
      </div>
      
      <div class="studios-grid">
        ${gridHTML}
      </div>
    </div>
    ${createFooter()}
  `;

  // Hydrate back button click
  const backBtn = container.querySelector('#studios-back-button');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.history.back();
    });
  }

  // Hydrate circular card clicks
  container.querySelectorAll('.studio-circle-card').forEach(card => {
    card.addEventListener('click', () => {
      const route = card.dataset.route;
      if (route) navigate(route);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}
