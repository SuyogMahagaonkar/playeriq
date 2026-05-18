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
  getSettings
} from './firebase.js';
import { getProgress, saveProgressLocal, removeProgressLocal, clearProgressLocal } from './storage.js';

// updateNavbarAvatar is wired in from Navbar to avoid circular deps
let _updateNavbarAvatar = null;
export function setNavbarAvatarUpdater(fn) { _updateNavbarAvatar = fn; }

// ---- State ----
let currentUser = null;
const listeners = new Set();

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

      // Migrate any existing localStorage history to Firestore
      const localHistory = getProgress();
      if (localHistory.length > 0) {
        console.log('[Auth] Migrating local watch history to Firestore...');
        for (const item of localHistory) {
          await saveProgressToCloud(user.uid, item);
        }
        clearProgressLocal();
      }
    }

    notifyListeners();
    if (_updateNavbarAvatar) _updateNavbarAvatar(user);
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

export async function logout() {
  await signOutUser();
}

// ---- Watch History (Cloud or Local fallback) ----
export async function saveProgress(media) {
  // If only less than 5 minutes (300 seconds) remaining, treat as fully watched
  const isWatched = media.duration > 0 && (media.duration - media.currentTime <= 300);
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
