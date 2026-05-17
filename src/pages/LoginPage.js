// ========================================
// PlayerIQ — Login Page
// ========================================

import { login, onUserChange } from '../services/auth.js';
import { navigate } from '../services/router.js';

// Popular movie posters for the card fan decoration
const POSTER_URLS = [
  'https://image.tmdb.org/t/p/w185/qNBAXBIQlnOThrVvA6mA2B5ggV6.jpg',  // Interstellar
  'https://image.tmdb.org/t/p/w185/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',  // Inception
  'https://image.tmdb.org/t/p/w185/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',  // Oppenheimer
  'https://image.tmdb.org/t/p/w185/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg',  // The Dark Knight
];

const BACKDROP_URL = 'https://image.tmdb.org/t/p/original/mDfJG3LC3Dqb67AZ52x3Z0jU0uB.jpg';

const BENEFITS = [
  { icon: '☁️', text: 'Sync your watch history across all devices' },
  { icon: '▶️', text: 'Resume watching right where you left off' },
  { icon: '⭐', text: 'Build and manage your personal watchlist' },
  { icon: '🔔', text: 'Get notified when new episodes drop' },
];

let unsubscribeAuth = null;

export function renderLoginPage(container, onSkip) {
  container.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'login-page';
  page.id = 'login-page';

  page.innerHTML = `
    <!-- Left: Cinematic backdrop -->
    <div class="login-backdrop">
      <img
        class="login-backdrop-img"
        src="${BACKDROP_URL}"
        alt="Movies backdrop"
        loading="eager"
      />
      <div class="login-backdrop-overlay"></div>
      <div class="login-backdrop-gradient"></div>

      <!-- Floating poster fan -->
      <div class="login-backdrop-cards">
        ${POSTER_URLS.map(url => `
          <div class="login-backdrop-card">
            <img src="${url}" alt="" loading="lazy" />
          </div>
        `).join('')}
      </div>

      <!-- Tagline -->
      <div class="login-backdrop-tagline">
        <h2>Every story,<br/>one platform.</h2>
        <p>Movies, TV shows, trending — all in one place.</p>
      </div>
    </div>

    <!-- Right: Login panel -->
    <div class="login-panel">
      <!-- Floating particles (decorative) -->
      <div class="login-particles">
        <div class="login-particle"></div>
        <div class="login-particle"></div>
        <div class="login-particle"></div>
      </div>

      <!-- Brand -->
      <div class="login-brand">
        <div class="login-brand-icon">▶</div>
        <div class="login-brand-name">Player<span>IQ</span></div>
      </div>

      <!-- Heading -->
      <div class="login-heading">
        <h1>Welcome back.</h1>
        <p>Sign in to sync your history and picks across every device you own.</p>
      </div>

      <!-- Benefits -->
      <div class="login-benefits">
        ${BENEFITS.map(b => `
          <div class="login-benefit-item">
            <div class="login-benefit-icon">${b.icon}</div>
            <span>${b.text}</span>
          </div>
        `).join('')}
      </div>

      <!-- Error -->
      <div class="login-error" id="login-error">
        Sign-in failed. Please try again or continue as guest.
      </div>

      <!-- Divider -->
      <div class="login-divider">Continue with</div>

      <!-- Google Button -->
      <button class="login-google-btn" id="login-google-btn" aria-label="Sign in with Google">
        <!-- Google G logo SVG -->
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span id="login-google-btn-text">Sign in with Google</span>
      </button>

      <!-- Guest skip -->
      <div class="login-skip">
        Just browsing? &nbsp;
        <button id="login-skip-btn">Continue as guest →</button>
      </div>

      <!-- Privacy note -->
      <div class="login-privacy">
        By signing in you agree to our Terms of Service and Privacy Policy.
        We never sell your data.
      </div>
    </div>
  `;

  container.appendChild(page);

  // ---- Event: Google Sign-In ----
  const googleBtn = page.querySelector('#login-google-btn');
  const btnText = page.querySelector('#login-google-btn-text');
  const errorEl = page.querySelector('#login-error');

  googleBtn.addEventListener('click', async () => {
    googleBtn.classList.add('loading');
    btnText.textContent = 'Signing in…';
    googleBtn.innerHTML = `
      <div class="btn-spinner"></div>
      <span>Signing in…</span>
    `;
    errorEl.classList.remove('visible');

    try {
      await login();
      // Auth listener in auth.js will call updateNavbarAvatar and trigger re-render
      destroyLoginPage(container, onSkip);
    } catch (err) {
      googleBtn.classList.remove('loading');
      googleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span id="login-google-btn-text">Sign in with Google</span>
      `;
      errorEl.classList.add('visible');
      console.error('[Login] Sign-in failed:', err);
    }
  });

  // ---- Event: Guest / Skip ----
  page.querySelector('#login-skip-btn').addEventListener('click', () => {
    destroyLoginPage(container, onSkip);
  });
}

function destroyLoginPage(container, onSkip) {
  const page = document.getElementById('login-page');
  if (page) {
    page.style.animation = 'none';
    page.style.opacity = '0';
    page.style.transition = 'opacity 0.35s ease';
    setTimeout(() => {
      page.remove();
      if (typeof onSkip === 'function') onSkip();
    }, 350);
  }
}
