// ========================================
// PlayerIQ — Firebase Service
// ========================================

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
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
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    console.error('[Firebase] Sign-in error:', err);
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
              episodeDocId: epDoc.id
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
  safeSearch: true
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

