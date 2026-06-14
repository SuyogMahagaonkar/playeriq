// ========================================
// PlayerIQ — Login Page
// ========================================

import { login, loginEmail, signUpEmail, onUserChange, logout, resendVerification, reloadUser } from '../services/auth.js';
import { navigate } from '../services/router.js';
import '../styles/login.css';

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

export function renderLoginPage(container) {
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
        Sign-in failed. Please try again.
      </div>

      <!-- Email / Password Form -->
      <form class="login-form" id="login-email-form" style="margin-bottom: var(--space-xl);">
        <div class="login-form-group" id="form-group-name" style="display: none;">
          <label for="login-name">Name</label>
          <input type="text" id="login-name" class="login-input" placeholder="Your Name" autocomplete="name" />
        </div>

        <div class="login-form-group">
          <label for="login-email">Email Address</label>
          <input type="email" id="login-email" class="login-input" placeholder="you@example.com" required autocomplete="email" />
        </div>

        <div class="login-form-group">
          <label for="login-password">Password</label>
          <input type="password" id="login-password" class="login-input" placeholder="••••••••" required autocomplete="current-password" />
        </div>

        <button type="submit" class="login-submit-btn" id="login-submit-btn" style="margin-top: var(--space-xs);">
          <span>Sign In</span>
        </button>

        <div class="login-mode-switch">
          <span id="mode-label-text">Don't have an account?</span>
          <a id="toggle-auth-mode">Sign Up</a>
        </div>
      </form>

      <!-- Divider -->
      <div class="login-divider">or continue with</div>

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

      <!-- Privacy note -->
      <div class="login-privacy" style="margin-top: var(--space-xl);">
        By signing in you agree to our Terms of Service and Privacy Policy.
        We never sell your data.
      </div>
    </div>
  `;

  container.appendChild(page);

  // ---- Form State & Toggles ----
  let isSignUpMode = false;
  const nameGroup = page.querySelector('#form-group-name');
  const nameInput = page.querySelector('#login-name');
  const emailInput = page.querySelector('#login-email');
  const passwordInput = page.querySelector('#login-password');
  const submitBtn = page.querySelector('#login-submit-btn');
  const submitBtnText = submitBtn.querySelector('span');
  const toggleModeBtn = page.querySelector('#toggle-auth-mode');
  const modeLabelText = page.querySelector('#mode-label-text');
  const errorEl = page.querySelector('#login-error');

  toggleModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUpMode = !isSignUpMode;
    errorEl.classList.remove('visible');
    
    if (isSignUpMode) {
      nameGroup.style.display = 'flex';
      nameInput.required = true;
      submitBtnText.textContent = 'Create Account';
      modeLabelText.textContent = 'Already have an account?';
      toggleModeBtn.textContent = 'Sign In';
      passwordInput.autocomplete = 'new-password';
    } else {
      nameGroup.style.display = 'none';
      nameInput.required = false;
      submitBtnText.textContent = 'Sign In';
      modeLabelText.textContent = "Don't have an account?";
      toggleModeBtn.textContent = 'Sign Up';
      passwordInput.autocomplete = 'current-password';
    }
  });

  // ---- Event: Email Sign-In / Sign-Up ----
  const emailForm = page.querySelector('#login-email-form');
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.remove('visible');
    submitBtn.classList.add('loading');
    const originalText = submitBtnText.textContent;
    submitBtn.innerHTML = `
      <div class="btn-spinner"></div>
      <span>${isSignUpMode ? 'Creating Account…' : 'Signing in…'}</span>
    `;

    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (isSignUpMode) {
        const displayName = nameInput.value.trim();
        await signUpEmail(email, password, displayName);
      } else {
        await loginEmail(email, password);
      }
      destroyLoginPage(container);
    } catch (err) {
      console.error('[Login] Email auth error:', err);
      
      let userFriendlyMsg = 'Authentication failed. Please try again.';
      if (err.code === 'auth/invalid-email') {
        userFriendlyMsg = 'Invalid email address format.';
      } else if (err.code === 'auth/user-disabled') {
        userFriendlyMsg = 'This account has been disabled.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        userFriendlyMsg = 'Incorrect email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        userFriendlyMsg = 'An account with this email already exists.';
      } else if (err.code === 'auth/weak-password') {
        userFriendlyMsg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/operation-not-allowed') {
        userFriendlyMsg = 'Email/Password sign-in is disabled in Firebase console.';
      }

      errorEl.textContent = userFriendlyMsg;
      errorEl.classList.add('visible');

      // Reset button
      submitBtn.classList.remove('loading');
      submitBtn.innerHTML = `<span>${originalText}</span>`;
    }
  });

  // ---- Event: Google Sign-In ----
  const googleBtn = page.querySelector('#login-google-btn');
  const btnText = page.querySelector('#login-google-btn-text');

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
      destroyLoginPage(container);
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
}

function destroyLoginPage(container) {
  const page = document.getElementById('login-page');
  if (page) {
    page.style.animation = 'none';
    page.style.opacity = '0';
    page.style.transition = 'opacity 0.35s ease';
    setTimeout(() => {
      page.remove();
      const overlay = document.getElementById('login-overlay');
      if (overlay) overlay.remove();
    }, 350);
  }
}

export function showVerificationOverlay(container, user) {
  container.innerHTML = '';
  
  const card = document.createElement('div');
  card.className = 'login-page verification-page';
  card.innerHTML = `
    <div class="login-panel" style="max-width: 480px; margin: 0 auto; text-align: center; justify-content: center; align-items: center;">
      <!-- Brand -->
      <div class="login-brand" style="margin-bottom: var(--space-xl);">
        <div class="login-brand-icon">▶</div>
        <div class="login-brand-name">Player<span>IQ</span></div>
      </div>

      <div class="login-heading" style="margin-bottom: var(--space-lg);">
        <h1 style="font-size: var(--text-2xl); font-weight: var(--weight-extrabold); color: var(--text-primary);">Verify Your Email</h1>
        <p style="color: var(--text-muted); font-size: var(--text-sm); line-height: var(--leading-relaxed); margin-top: var(--space-xs);">
          We sent a verification link to <strong style="color: var(--accent);">${user.email}</strong>.<br/>
          Check your inbox and click the link to verify your account.
        </p>
      </div>

      <!-- Success / Error Status Info -->
      <div class="login-error" id="verify-status" style="margin-bottom: var(--space-md); width: 100%; border-radius: var(--radius-md); text-align: center;">
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-sm); width: 100%;">
        <button id="verify-check-btn" class="login-submit-btn" style="background: var(--gradient-accent); font-weight: var(--weight-bold);">
          <span>I've Verified My Email</span>
        </button>

        <button id="verify-resend-btn" class="login-input" style="background: rgba(255,255,255,0.02); border: 1.5px solid var(--border-color); cursor: pointer; transition: all var(--transition-normal); font-weight: var(--weight-semibold);">
          <span>Resend Verification Link</span>
        </button>

        <button id="verify-logout-btn" class="login-skip" style="background: none; border: none; cursor: pointer; color: var(--text-dim); text-decoration: underline; margin-top: var(--space-md);">
          Log Out
        </button>
      </div>
    </div>
  `;
  container.appendChild(card);

  const checkBtn = card.querySelector('#verify-check-btn');
  const resendBtn = card.querySelector('#verify-resend-btn');
  const logoutBtn = card.querySelector('#verify-logout-btn');
  const statusEl = card.querySelector('#verify-status');

  const showStatus = (text, isSuccess) => {
    statusEl.textContent = text;
    statusEl.style.display = 'block';
    if (isSuccess) {
      statusEl.style.background = 'rgba(16, 185, 129, 0.1)';
      statusEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      statusEl.style.color = '#34d399';
    } else {
      statusEl.style.background = 'rgba(229, 9, 20, 0.1)';
      statusEl.style.borderColor = 'rgba(229, 9, 20, 0.3)';
      statusEl.style.color = '#ff6b6b';
    }
  };

  checkBtn.addEventListener('click', async () => {
    checkBtn.classList.add('loading');
    checkBtn.innerHTML = `<div class="btn-spinner"></div><span>Checking...</span>`;
    statusEl.style.display = 'none';

    try {
      const updatedUser = await reloadUser();
      if (updatedUser && updatedUser.emailVerified) {
        // Verification succeeded, global listener will remove container
      } else {
        showStatus("Email not verified yet. Please click the link in the email and try again.", false);
        checkBtn.classList.remove('loading');
        checkBtn.innerHTML = `<span>I've Verified My Email</span>`;
      }
    } catch (err) {
      console.error(err);
      showStatus("Error checking status: " + err.message, false);
      checkBtn.classList.remove('loading');
      checkBtn.innerHTML = `<span>I've Verified My Email</span>`;
    }
  });

  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
    resendBtn.textContent = 'Sending...';
    statusEl.style.display = 'none';

    try {
      await resendVerification();
      showStatus("Verification link resent successfully!", true);
      // Wait 30s before allowing another resend
      let cooldown = 30;
      const interval = setInterval(() => {
        cooldown--;
        if (cooldown <= 0) {
          clearInterval(interval);
          resendBtn.disabled = false;
          resendBtn.style.opacity = '1';
          resendBtn.textContent = 'Resend Verification Link';
        } else {
          resendBtn.textContent = `Resend in ${cooldown}s`;
        }
      }, 1000);
    } catch (err) {
      console.error(err);
      showStatus("Failed to send: " + err.message, false);
      resendBtn.disabled = false;
      resendBtn.style.opacity = '1';
      resendBtn.textContent = 'Resend Verification Link';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    statusEl.style.display = 'none';
    try {
      await logout();
    } catch (err) {
      console.error(err);
      showStatus("Failed to log out: " + err.message, false);
    }
  });
}
