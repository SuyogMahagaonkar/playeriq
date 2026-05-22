// ========================================
// PlayerIQ — Firebase Service
// ========================================

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

// ---- Config ----
const firebaseConfig = {
  apiKey: "AIzaSyD3KjFMtg5aIMgFjr_CBTDrhXr0XK1bPIM",
  authDomain: "playeriq-db.firebaseapp.com",
  projectId: "playeriq-db",
  storageBucket: "playeriq-db.firebasestorage.app",
  messagingSenderId: "527529297313",
  appId: "1:527529297313:web:b8b01da095a9017b38b7e0"
};

// ---- Init ----
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ---- Auth ----
const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    // Detect mobile WebViews or mobile devices where popups are blocked or extremely slow
    const isMobileOrWebView = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                              (window.Capacitor && window.Capacitor.isNative) ||
                              navigator.userAgent.includes('wv');

    if (isMobileOrWebView) {
      console.log('[Firebase] Mobile or WebView detected, using signInWithRedirect...');
      await signInWithRedirect(auth, provider);
      // Under redirect, the page will reload and redirect back, so return a pending promise
      return new Promise(() => {}); 
    } else {
      console.log('[Firebase] Desktop detected, using signInWithPopup...');
      const result = await signInWithPopup(auth, provider);
      return result.user;
    }
  } catch (err) {
    console.error('[Firebase] Sign-in error:', err);
    throw err;
  }
}

export async function loginWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    console.error('[Firebase] Email sign-in error:', err);
    throw err;
  }
}

export async function signUpWithEmail(email, password, displayName) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    // Return updated user
    return result.user;
  } catch (err) {
    console.error('[Firebase] Email sign-up error:', err);
    throw err;
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('[Firebase] Sign-out error:', err);
  }
}

/**
 * Subscribe to auth state changes.
 * @param {(user: import('firebase/auth').User|null) => void} callback
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

// ---- Firestore: Watch History ----

/**
 * Save a watch progress entry to Firestore.
 * @param {string} userId
 * @param {Object} media - { id, title, type, poster_path, backdrop_path, season, episode, currentTime, duration }
 */
export async function saveProgressToCloud(userId, media) {
  try {
    if (media.type === 'tv') {
      const showId = String(media.id);
      const seasonNum = String(media.season);
      const episodeNum = String(media.episode);

      // 1. Set main TV Show document
      const showRef = doc(db, 'users', userId, 'watch_history', showId);
      await setDoc(showRef, {
        id: media.id,
        title: media.title,
        type: 'tv',
        poster_path: media.poster_path,
        backdrop_path: media.backdrop_path,
        timestamp: serverTimestamp()
      }, { merge: true });

      // 2. Set Season document
      const seasonRef = doc(db, 'users', userId, 'watch_history', showId, 'seasons', `season_${seasonNum}`);
      await setDoc(seasonRef, {
        season: Number(seasonNum),
        timestamp: serverTimestamp()
      }, { merge: true });

      // 3. Set Episode document
      const epRef = doc(db, 'users', userId, 'watch_history', showId, 'seasons', `season_${seasonNum}`, 'episodes', `episode_${episodeNum}`);
      await setDoc(epRef, {
        ...media,
        timestamp: serverTimestamp()
      }, { merge: true });

    } else {
      // Movie
      const ref = doc(db, 'users', userId, 'watch_history', String(media.id));
      await setDoc(ref, {
        ...media,
        timestamp: serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error('[Firebase] Failed to save progress:', err);
  }
}

/**
 * Remove a watch history entry from Firestore.
 * @param {string} userId
 * @param {string|number} mediaId
 */
export async function removeProgressFromCloud(userId, mediaId) {
  try {
    if (typeof mediaId === 'string' && mediaId.includes('_s') && mediaId.includes('_e')) {
      const parts = mediaId.split('_s');
      const showId = parts[0];
      const rest = parts[1].split('_e');
      const seasonNum = rest[0];
      const episodeNum = rest[1];

      const epRef = doc(db, 'users', userId, 'watch_history', showId, 'seasons', `season_${seasonNum}`, 'episodes', `episode_${episodeNum}`);
      await deleteDoc(epRef);

      // Clean up season if empty
      const epsColRef = collection(db, 'users', userId, 'watch_history', showId, 'seasons', `season_${seasonNum}`, 'episodes');
      const epsSnap = await getDocs(epsColRef);
      if (epsSnap.empty) {
        const seasonRef = doc(db, 'users', userId, 'watch_history', showId, 'seasons', `season_${seasonNum}`);
        await deleteDoc(seasonRef);
      }

      // Clean up show if empty
      const seasonsColRef = collection(db, 'users', userId, 'watch_history', showId, 'seasons');
      const seasonsSnap = await getDocs(seasonsColRef);
      if (seasonsSnap.empty) {
        const showRef = doc(db, 'users', userId, 'watch_history', showId);
        await deleteDoc(showRef);
      }
    } else {
      const ref = doc(db, 'users', userId, 'watch_history', String(mediaId));
      await deleteDoc(ref);
    }
  } catch (err) {
    console.error('[Firebase] Failed to remove progress:', err);
  }
}

/**
 * Fetch all watch history for a user from Firestore.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchWatchHistory(userId) {
  try {
    const colRef = collection(db, 'users', userId, 'watch_history');
    const snapshot = await getDocs(colRef);
    const items = [];
    const tvShowDocs = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.type === 'tv') {
        tvShowDocs.push({ docId: docSnap.id, ...data });
      } else {
        items.push({ 
          ...data, 
          id: data.id || docSnap.id, 
          docId: docSnap.id 
        });
      }
    });

    if (tvShowDocs.length > 0) {
      await Promise.all(tvShowDocs.map(async (show) => {
        const seasonsColRef = collection(db, 'users', userId, 'watch_history', show.docId, 'seasons');
        const seasonsSnap = await getDocs(seasonsColRef);

        await Promise.all(seasonsSnap.docs.map(async (seasonDoc) => {
          const episodesColRef = collection(db, 'users', userId, 'watch_history', show.docId, 'seasons', seasonDoc.id, 'episodes');
          const episodesSnap = await getDocs(episodesColRef);

          episodesSnap.forEach(epDoc => {
            const epData = epDoc.data();
            items.push({
              ...epData,
              id: show.id,
              docId: `${show.docId}_s${epData.season}_e${epData.episode}`,
              showDocId: show.docId,
              seasonDocId: seasonDoc.id,
              episodeDocId: epDoc.id,
              showPosterPath: show.poster_path || epData.poster_path
            });
          });
        }));
      }));
    }

    // Sort by timestamp descending (most recent first)
    items.sort((a, b) => {
      const ta = a.timestamp?.toMillis?.() ?? 0;
      const tb = b.timestamp?.toMillis?.() ?? 0;
      return tb - ta;
    });
    return items;
  } catch (err) {
    console.error('[Firebase] Failed to fetch watch history:', err);
    return [];
  }
}

/**
 * Save/update user profile data in Firestore.
 * @param {string} userId
 * @param {Object} data
 */
export async function saveUserProfile(userId, data) {
  try {
    const ref = doc(db, 'users', userId);
    await setDoc(ref, data, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to save user profile:', err);
  }
}

/**
 * Get user profile data from Firestore.
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
export async function getUserProfile(userId) {
  try {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('[Firebase] Failed to get user profile:', err);
    return null;
  }
}

// ---- Firestore: Watchlist ----

/**
 * Add a media item to the user's watchlist.
 * @param {string} userId
 * @param {Object} media - { id, title, type, poster_path, backdrop_path }
 */
export async function addToWatchlist(userId, media) {
  try {
    const ref = doc(db, 'users', userId, 'watchlist', String(media.id));
    await setDoc(ref, {
      id: media.id,
      title: media.title || media.name,
      type: media.type || media.media_type || 'movie',
      poster_path: media.poster_path || null,
      backdrop_path: media.backdrop_path || null,
      vote_average: media.vote_average || null,
      addedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to add to watchlist:', err);
    throw err;
  }
}

/**
 * Remove a media item from the user's watchlist.
 * @param {string} userId
 * @param {string|number} mediaId
 */
export async function removeFromWatchlist(userId, mediaId) {
  try {
    const ref = doc(db, 'users', userId, 'watchlist', String(mediaId));
    await deleteDoc(ref);
  } catch (err) {
    console.error('[Firebase] Failed to remove from watchlist:', err);
    throw err;
  }
}

/**
 * Check if a media item is in the user's watchlist.
 * @param {string} userId
 * @param {string|number} mediaId
 * @returns {Promise<boolean>}
 */
export async function isInWatchlist(userId, mediaId) {
  try {
    const ref = doc(db, 'users', userId, 'watchlist', String(mediaId));
    const snap = await getDoc(ref);
    return snap.exists();
  } catch (err) {
    console.error('[Firebase] Failed to check watchlist:', err);
    return false;
  }
}

/**
 * Fetch all watchlist items for a user.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchWatchlist(userId) {
  try {
    const colRef = collection(db, 'users', userId, 'watchlist');
    const snapshot = await getDocs(colRef);
    const items = [];
    snapshot.forEach(docSnap => items.push({ ...docSnap.data(), id: docSnap.id }));
    items.sort((a, b) => {
      const ta = a.addedAt?.toMillis?.() ?? 0;
      const tb = b.addedAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    return items;
  } catch (err) {
    console.error('[Firebase] Failed to fetch watchlist:', err);
    return [];
  }
}

// ---- Firestore: Settings ----

const DEFAULT_SETTINGS = {
  language: 'all',
  autoplay: true,
  quality: 'auto',
  safeSearch: true,
  themeColor: 'purple',
  themeDark: false,
  seekInterval: 10,
  skipRecaps: false,
  subtitleSize: '100%',
  subtitleColor: '#ffffff',
  subtitleBgOpacity: 0.5
};

/**
 * Save user preferences to Firestore.
 * @param {string} userId
 * @param {Object} settings
 */
export async function saveSettings(userId, settings) {
  try {
    const ref = doc(db, 'users', userId);
    await setDoc(ref, { settings: { ...settings } }, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to save settings:', err);
    throw err;
  }
}

/**
 * Get user preferences from Firestore.
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getSettings(userId) {
  try {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().settings) {
      return { ...DEFAULT_SETTINGS, ...snap.data().settings };
    }
    return { ...DEFAULT_SETTINGS };
  } catch (err) {
    console.error('[Firebase] Failed to get settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Clear all watch history for a user.
 * @param {string} userId
 */
export async function clearAllWatchHistory(userId) {
  try {
    const colRef = collection(db, 'users', userId, 'watch_history');
    const snapshot = await getDocs(colRef);
    const deletions = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (data.type === 'tv') {
        const seasonsColRef = collection(db, 'users', userId, 'watch_history', docSnap.id, 'seasons');
        const seasonsSnap = await getDocs(seasonsColRef);

        for (const seasonDoc of seasonsSnap.docs) {
          const episodesColRef = collection(db, 'users', userId, 'watch_history', docSnap.id, 'seasons', seasonDoc.id, 'episodes');
          const episodesSnap = await getDocs(episodesColRef);

          episodesSnap.forEach(epDoc => {
            deletions.push(deleteDoc(epDoc.ref));
          });
          deletions.push(deleteDoc(seasonDoc.ref));
        }
      }
      deletions.push(deleteDoc(docSnap.ref));
    }

    await Promise.all(deletions);
  } catch (err) {
    console.error('[Firebase] Failed to clear watch history:', err);
    throw err;
  }
}

// ---- Firestore: Notifications ----

/**
 * Add an unaired episode notification alert.
 * @param {string} userId
 * @param {Object} notif - { epKey, tvId, seasonNumber, episodeNumber, title, airDate }
 */
export async function addNotificationToCloud(userId, notif) {
  try {
    const ref = doc(db, 'users', userId, 'notifications', notif.epKey);
    await setDoc(ref, {
      ...notif,
      createdAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to add notification:', err);
  }
}

/**
 * Remove an unaired episode notification alert.
 * @param {string} userId
 * @param {string} epKey
 */
export async function removeNotificationFromCloud(userId, epKey) {
  try {
    const ref = doc(db, 'users', userId, 'notifications', epKey);
    await deleteDoc(ref);
  } catch (err) {
    console.error('[Firebase] Failed to remove notification:', err);
  }
}

/**
 * Check if an unaired episode notification alert exists.
 * @param {string} userId
 * @param {string} epKey
 * @returns {Promise<boolean>}
 */
export async function isNotificationInCloud(userId, epKey) {
  try {
    const ref = doc(db, 'users', userId, 'notifications', epKey);
    const snap = await getDoc(ref);
    return snap.exists();
  } catch (err) {
    console.error('[Firebase] Failed to check notification:', err);
    return false;
  }
}

/**
 * Get system-wide global configuration.
 * @returns {Promise<Object>}
 */
export async function getGlobalConfig() {
  try {
    const ref = doc(db, 'system', 'config');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data();
    }
    return { showSafeSearchToggle: true };
  } catch (err) {
    console.error('[Firebase] Failed to get global config:', err);
    return { showSafeSearchToggle: true };
  }
}

/**
 * Save system-wide global configuration.
 * @param {Object} config
 */
export async function saveGlobalConfig(config) {
  try {
    const ref = doc(db, 'system', 'config');
    await setDoc(ref, config, { merge: true });
  } catch (err) {
    console.error('[Firebase] Failed to save global config:', err);
    throw err;
  }
}

/**
 * Export complete watch history and watchlist for a user.
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function exportUserLibrary(userId) {
  try {
    const history = await fetchWatchHistory(userId);
    const watchlistRef = collection(db, 'users', userId, 'watchlist');
    const watchlistSnap = await getDocs(watchlistRef);
    const watchlist = [];
    watchlistSnap.forEach(docSnap => {
      watchlist.push(docSnap.data());
    });
    
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      history,
      watchlist
    };
  } catch (err) {
    console.error('[Firebase] Failed to export library:', err);
    throw err;
  }
}

/**
 * Import complete watch history and watchlist for a user.
 * @param {string} userId
 * @param {Object} data
 */
export async function importUserLibrary(userId, data) {
  try {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup data format');
    
    if (Array.isArray(data.history)) {
      for (const item of data.history) {
        await saveProgressToCloud(userId, item);
      }
    }
    
    if (Array.isArray(data.watchlist)) {
      for (const item of data.watchlist) {
        const ref = doc(db, 'users', userId, 'watchlist', item.id);
        await setDoc(ref, item, { merge: true });
      }
    }
  } catch (err) {
    console.error('[Firebase] Failed to import library:', err);
    throw err;
  }
}

