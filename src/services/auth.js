// ========================================
// PlayerIQ — Auth State Manager
// ========================================

import {
  onAuthChange,
  signInWithGoogle,
  signOutUser,
  saveUserProfile,
  fetchWatchHistory,
  saveProgressToCloud,
  removeProgressFromCloud,
  getSettings,
  exportUserLibrary,
  importUserLibrary,
  loginWithEmail,
  signUpWithEmail
} from './firebase.js';
import { getProgress, saveProgressLocal, removeProgressLocal, clearProgressLocal } from './storage.js';

// updateNavbarAvatar is wired in from Navbar to avoid circular deps
let _updateNavbarAvatar = null;
export function setNavbarAvatarUpdater(fn) { _updateNavbarAvatar = fn; }

// ---- State ----
let currentUser = null;
const listeners = new Set();

// ---- Auth Ready Promise ----
let isAuthReady = false;
let authReadyResolve = null;
const authReadyPromise = new Promise(resolve => {
  authReadyResolve = resolve;
});

export function waitAuthReady() {
  if (isAuthReady) return Promise.resolve(currentUser);
  return authReadyPromise;
}

/**
 * Returns the currently signed-in Firebase user, or null.
 */
export function getUser() {
  return currentUser;
}

/**
 * Register a callback to be called when auth state changes.
 * @param {(user) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onUserChange(fn) {
  listeners.add(fn);
  fn(currentUser); // immediately call with current state
  return () => listeners.delete(fn);
}

function notifyListeners() {
  listeners.forEach(fn => fn(currentUser));
}

// ---- Bootstrap auth listener ----
export function initAuth() {
  onAuthChange(async (user) => {
    currentUser = user;

    if (user) {
      // Persist user profile
      await saveUserProfile(user.uid, {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        lastLogin: new Date().toISOString()
      });

      // Sync settings to localStorage for synchronous access in API calls
      const prefs = await getSettings(user.uid);
      localStorage.setItem('piq_safesearch', prefs.safeSearch ? 'true' : 'false');
      localStorage.setItem('piq_theme_color', prefs.themeColor || 'red');
      localStorage.setItem('piq_theme_dark', prefs.themeDark ? 'oled' : 'default');
      localStorage.setItem('piq_seek_interval', String(prefs.seekInterval || 10));
      localStorage.setItem('piq_skip_recaps', prefs.skipRecaps ? 'true' : 'false');
      localStorage.setItem('piq_sub_size', prefs.subtitleSize || '100%');
      localStorage.setItem('piq_sub_color', prefs.subtitleColor || '#ffffff');
      localStorage.setItem('piq_sub_bg_opacity', String(prefs.subtitleBgOpacity ?? 0.5));
      localStorage.setItem('piq_quality', prefs.quality || 'auto');

      // Apply the user's customized theme instantly
      applyGlobalTheme();

      // Migrate any existing localStorage history to Firestore
      const localHistory = getProgress();
      if (localHistory.length > 0) {
        console.log('[Auth] Migrating local watch history to Firestore...');
        for (const item of localHistory) {
          await saveProgressToCloud(user.uid, item);
        }
        clearProgressLocal();
      }
    } else {
      // User logged out - clear all user-specific settings so they don't bleed into guest/other sessions
      localStorage.removeItem('piq_safesearch');
      localStorage.removeItem('piq_theme_color');
      localStorage.removeItem('piq_theme_dark');
      localStorage.removeItem('piq_seek_interval');
      localStorage.removeItem('piq_skip_recaps');
      localStorage.removeItem('piq_sub_size');
      localStorage.removeItem('piq_sub_color');
      localStorage.removeItem('piq_sub_bg_opacity');
      localStorage.removeItem('piq_quality');

      // Revert style to standard default theme
      applyGlobalTheme();
    }

    notifyListeners();
    if (_updateNavbarAvatar) _updateNavbarAvatar(user);

    // Mark auth ready on the first change event from Firebase
    if (!isAuthReady) {
      isAuthReady = true;
      if (authReadyResolve) authReadyResolve(user);
    }
  });
}

// ---- Auth Actions (exported for UI) ----
export async function login() {
  try {
    await signInWithGoogle();
  } catch (err) {
    console.error('[Auth] Login failed:', err);
    throw err;
  }
}

export async function loginEmail(email, password) {
  try {
    return await loginWithEmail(email, password);
  } catch (err) {
    console.error('[Auth] Email login failed:', err);
    throw err;
  }
}

export async function signUpEmail(email, password, displayName) {
  try {
    return await signUpWithEmail(email, password, displayName);
  } catch (err) {
    console.error('[Auth] Email sign-up failed:', err);
    throw err;
  }
}

export async function logout() {
  await signOutUser();
}

export async function saveProgress(media) {
  // A title is watched if progress is 90% or higher, OR less than 5 minutes (300s) remaining
  const progressPercent = media.duration > 0 ? (media.currentTime / media.duration) : 0;
  const isWatched = media.duration > 0 && (
    progressPercent >= 0.90 || 
    (media.duration - media.currentTime <= 300)
  );
  const mediaWithWatched = {
    ...media,
    watched: isWatched || media.watched || false
  };

  if (currentUser) {
    await saveProgressToCloud(currentUser.uid, mediaWithWatched);
  } else {
    saveProgressLocal(mediaWithWatched);
  }
}

export async function getWatchHistory() {
  if (currentUser) {
    return await fetchWatchHistory(currentUser.uid);
  }
  return getProgress();
}

export async function removeFromHistory(mediaId) {
  if (currentUser) {
    await removeProgressFromCloud(currentUser.uid, mediaId);
  } else {
    removeProgressLocal(mediaId);
  }
}

/**
 * Apply the current global HSL accent colors and dark mode theme.
 */
export function applyGlobalTheme() {
  document.documentElement.setAttribute('data-theme-color', 'purple');
  document.documentElement.setAttribute('data-theme-dark', 'oled');
}

export async function exportLibrary() {
  if (!currentUser) throw new Error('Must be logged in to export');
  return await exportUserLibrary(currentUser.uid);
}

export async function importLibrary(data) {
  if (!currentUser) throw new Error('Must be logged in to import');
  await importUserLibrary(currentUser.uid, data);
}
