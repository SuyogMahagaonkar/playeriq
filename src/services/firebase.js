// ========================================
// PlayerIQ — Firebase Service (Dynamic Loading)
// ========================================

// ---- Config ----
const firebaseConfig = {
  apiKey: "AIzaSyD3KjFMtg5aIMgFjr_CBTDrhXr0XK1bPIM",
  authDomain: "playeriq-db.firebaseapp.com",
  projectId: "playeriq-db",
  storageBucket: "playeriq-db.firebasestorage.app",
  messagingSenderId: "527529297313",
  appId: "1:527529297313:web:b8b01da095a9017b38b7e0"
};

// ---- Dynamic State & Live Bindings ----
let app = null;
export let auth = null;
export let db = null;

let authExports = {};
let firestoreExports = {};
let initPromise = null;

export async function ensureFirebaseInitialized() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const firebaseApp = await import('firebase/app');
    const firebaseAuth = await import('firebase/auth');
    const firebaseFirestore = await import('firebase/firestore');
    
    app = firebaseApp.initializeApp(firebaseConfig);
    auth = firebaseAuth.getAuth(app);
    db = firebaseFirestore.getFirestore(app);
    
    authExports = firebaseAuth;
    firestoreExports = firebaseFirestore;
  })();
  
  return initPromise;
}

// ---- Auth Actions ----

export async function signInWithGoogle() {
  await ensureFirebaseInitialized();
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = authExports;
  try {
    const provider = new GoogleAuthProvider();
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
  await ensureFirebaseInitialized();
  const { signInWithEmailAndPassword } = authExports;
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    console.error('[Firebase] Email sign-in error:', err);
    throw err;
  }
}

export async function signUpWithEmail(email, password, displayName) {
  await ensureFirebaseInitialized();
  const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = authExports;
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    try {
      await sendEmailVerification(result.user);
      console.log('[Firebase] Sent verification email on signup');
    } catch (sendErr) {
      console.error('[Firebase] Failed to send verification email on signup:', sendErr);
    }
    return result.user;
  } catch (err) {
    console.error('[Firebase] Email sign-up error:', err);
    throw err;
  }
}

export async function sendVerificationEmail(user) {
  await ensureFirebaseInitialized();
  const { sendEmailVerification } = authExports;
  try {
    await sendEmailVerification(user);
  } catch (err) {
    console.error('[Firebase] Send verification email error:', err);
    throw err;
  }
}

export async function signOutUser() {
  await ensureFirebaseInitialized();
  const { signOut } = authExports;
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
  ensureFirebaseInitialized().then(() => {
    const { onAuthStateChanged } = authExports;
    onAuthStateChanged(auth, callback);
  });
}

export function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

// ---- Firestore: Watch History ----

/**
 * Save a watch progress entry to Firestore.
 * @param {string} userId
 * @param {Object} media
 */
export async function saveProgressToCloud(userId, media) {
  await ensureFirebaseInitialized();
  const { doc, setDoc, serverTimestamp } = firestoreExports;
  try {
    if (media.type === 'tv') {
      const showId = String(media.id);
      const seasonNum = String(media.season);
      const episodeNum = String(media.episode);

      // 1. Set TV Show doc
      const showRef = doc(db, 'users', userId, 'watch_history', showId);
      await setDoc(showRef, {
        id: media.id,
        title: media.title,
        type: 'tv',
        poster_path: media.poster_path,
        backdrop_path: media.backdrop_path,
        timestamp: serverTimestamp()
      }, { merge: true });

      // 2. Set Season doc
      const seasonRef = doc(db, 'users', userId, 'watch_history', showId, 'seasons', `season_${seasonNum}`);
      await setDoc(seasonRef, {
        season: Number(seasonNum),
        timestamp: serverTimestamp()
      }, { merge: true });

      // 3. Set Episode doc
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
  await ensureFirebaseInitialized();
  const { doc, deleteDoc, collection, getDocs } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { collection, getDocs } = firestoreExports;
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

    // Sort by timestamp descending
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
  await ensureFirebaseInitialized();
  const { doc, setDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, getDoc } = firestoreExports;
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
 * @param {Object} media
 */
export async function addToWatchlist(userId, media) {
  await ensureFirebaseInitialized();
  const { doc, setDoc, serverTimestamp } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, deleteDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, getDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { collection, getDocs } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, setDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, getDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { collection, getDocs, deleteDoc } = firestoreExports;
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
 * @param {Object} notif
 */
export async function addNotificationToCloud(userId, notif) {
  await ensureFirebaseInitialized();
  const { doc, setDoc, serverTimestamp } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, deleteDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, getDoc } = firestoreExports;
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
 * Clear all notifications for a user in Firestore.
 * @param {string} userId
 */
export async function clearAllNotifications(userId) {
  await ensureFirebaseInitialized();
  const { collection, getDocs, deleteDoc } = firestoreExports;
  try {
    const colRef = collection(db, 'users', userId, 'notifications');
    const snapshot = await getDocs(colRef);
    const deletions = [];
    snapshot.forEach(docSnap => deletions.push(deleteDoc(docSnap.ref)));
    await Promise.all(deletions);
  } catch (err) {
    console.error('[Firebase] Failed to clear notifications:', err);
    throw err;
  }
}

/**
 * Get system-wide global configuration.
 * @returns {Promise<Object>}
 */
export async function getGlobalConfig() {
  await ensureFirebaseInitialized();
  const { doc, getDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, setDoc } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { collection, getDocs } = firestoreExports;
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
  await ensureFirebaseInitialized();
  const { doc, setDoc } = firestoreExports;
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

// ========================================
// Firestore: Watch Together Rooms
// ========================================

export async function createWatchPartyInCloud(partyId, partyData) {
  await ensureFirebaseInitialized();
  const { doc, setDoc, serverTimestamp } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId);
    await setDoc(ref, {
      ...partyData,
      createdAt: serverTimestamp()
    });
    console.log('[Firebase] Watch party room created:', partyId);
  } catch (err) {
    console.error('[Firebase] Failed to create watch party:', err);
    throw err;
  }
}

export async function getWatchPartyFromCloud(partyId) {
  await ensureFirebaseInitialized();
  const { doc, getDoc } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('[Firebase] Failed to get watch party:', err);
    throw err;
  }
}

export async function updateWatchPartyInCloud(partyId, updates) {
  await ensureFirebaseInitialized();
  const { doc, updateDoc } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId);
    await updateDoc(ref, updates);
  } catch (err) {
    console.error('[Firebase] Failed to update watch party:', err);
    throw err;
  }
}

export async function lockWatchPartyInCloud(partyId, locked) {
  await ensureFirebaseInitialized();
  const { doc, updateDoc } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId);
    await updateDoc(ref, { locked });
  } catch (err) {
    console.error('[Firebase] Failed to lock/unlock watch party:', err);
    throw err;
  }
}

export async function promoteMemberRoleInCloud(partyId, memberUid, role) {
  await ensureFirebaseInitialized();
  const { doc, getDoc, updateDoc } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const updatedMembers = (data.members || []).map(m => {
        if (m.uid === memberUid) {
          return { ...m, role };
        }
        return m;
      });
      await updateDoc(ref, { members: updatedMembers });
    }
  } catch (err) {
    console.error('[Firebase] Failed to promote/demote member role:', err);
    throw err;
  }
}

export async function removeMemberFromCloud(partyId, memberUid) {
  return leaveWatchPartyInCloud(partyId, memberUid);
}

export async function deleteChatMessageInCloud(partyId, messageId) {
  await ensureFirebaseInitialized();
  const { doc, deleteDoc } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId, 'messages', messageId);
    await deleteDoc(ref);
  } catch (err) {
    console.error('[Firebase] Failed to delete chat message:', err);
    throw err;
  }
}

export async function joinWatchPartyInCloud(partyId, member) {
  await ensureFirebaseInitialized();
  const { doc, getDoc, updateDoc } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('Party not found');
    }
    const data = snap.data();
    const existing = (data.members || []).find(m => m.uid === member.uid);
    if (!existing) {
      const updatedMembers = [...(data.members || []), member];
      await updateDoc(ref, {
        members: updatedMembers
      });
    }
  } catch (err) {
    console.error('[Firebase] Failed to join watch party:', err);
    throw err;
  }
}

export async function leaveWatchPartyInCloud(partyId, memberUid) {
  await ensureFirebaseInitialized();
  const { doc, getDoc, updateDoc } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const updatedMembers = (data.members || []).filter(m => m.uid !== memberUid);
      await updateDoc(ref, {
        members: updatedMembers
      });
    }
  } catch (err) {
    console.error('[Firebase] Failed to leave watch party:', err);
  }
}

export function subscribeToWatchParty(partyId, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { doc, onSnapshot } = firestoreExports;
    const ref = doc(db, 'watch_parties', partyId);
    unsub = onSnapshot(ref, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data());
      } else {
        onUpdate(null);
      }
    }, (err) => {
      console.error('[Firebase] Watch party sync error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

export async function sendChatMessageInCloud(partyId, messageData) {
  await ensureFirebaseInitialized();
  const { collection, addDoc, serverTimestamp } = firestoreExports;
  try {
    const colRef = collection(db, 'watch_parties', partyId, 'messages');
    await addDoc(colRef, {
      ...messageData,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('[Firebase] Failed to send chat message:', err);
    throw err;
  }
}

export function subscribeToChatMessages(partyId, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { collection, query, orderBy, onSnapshot } = firestoreExports;
    const colRef = collection(db, 'watch_parties', partyId, 'messages');
    const q = query(colRef, orderBy('timestamp', 'asc'));
    unsub = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach(docSnap => {
        msgs.push({ id: docSnap.id, ...docSnap.data() });
      });
      onUpdate(msgs);
    }, (err) => {
      console.error('[Firebase] Chat message sync error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

// ========================================
// Firestore: Friend System & Status
// ========================================

export async function sendFriendRequestInCloud(senderUid, targetEmail) {
  await ensureFirebaseInitialized();
  const { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } = firestoreExports;
  try {
    const q = query(collection(db, 'users'), where('email', '==', targetEmail.toLowerCase().trim()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('No user found with this email address.');
    
    const targetUserDoc = snap.docs[0];
    const targetUid = targetUserDoc.id;
    if (targetUid === senderUid) throw new Error('You cannot add yourself as a friend.');
    
    // Check if already friends
    const friendRef = doc(db, 'users', senderUid, 'friends', targetUid);
    const friendSnap = await getDoc(friendRef);
    if (friendSnap.exists()) throw new Error('You are already friends with this user.');
    
    const myProfile = await getUserProfile(senderUid);
    const reqRef = doc(db, 'users', targetUid, 'friend_requests', senderUid);
    await setDoc(reqRef, {
      senderUid,
      senderName: myProfile?.displayName || myProfile?.email?.split('@')[0] || 'User',
      senderEmail: myProfile?.email || '',
      senderAvatar: myProfile?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60',
      status: 'pending',
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('[Firebase] Failed to send friend request:', err);
    throw err;
  }
}

export async function acceptFriendRequestInCloud(userId, requestUid) {
  await ensureFirebaseInitialized();
  const { doc, setDoc, deleteDoc, serverTimestamp } = firestoreExports;
  try {
    const myProfile = await getUserProfile(userId);
    const friendProfile = await getUserProfile(requestUid);
    
    await setDoc(doc(db, 'users', userId, 'friends', requestUid), {
      uid: requestUid,
      name: friendProfile?.displayName || friendProfile?.email?.split('@')[0] || 'Friend',
      email: friendProfile?.email || '',
      avatar: friendProfile?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60',
      addedAt: serverTimestamp()
    });
    
    await setDoc(doc(db, 'users', requestUid, 'friends', userId), {
      uid: userId,
      name: myProfile?.displayName || myProfile?.email?.split('@')[0] || 'Friend',
      email: myProfile?.email || '',
      avatar: myProfile?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60',
      addedAt: serverTimestamp()
    });
    
    await deleteDoc(doc(db, 'users', userId, 'friend_requests', requestUid));
  } catch (err) {
    console.error('[Firebase] Failed to accept friend request:', err);
    throw err;
  }
}

export async function declineFriendRequestInCloud(userId, requestUid) {
  await ensureFirebaseInitialized();
  const { doc, deleteDoc } = firestoreExports;
  try {
    await deleteDoc(doc(db, 'users', userId, 'friend_requests', requestUid));
  } catch (err) {
    console.error('[Firebase] Failed to decline friend request:', err);
    throw err;
  }
}

export async function removeFriendFromCloud(userId, friendUid) {
  await ensureFirebaseInitialized();
  const { doc, deleteDoc } = firestoreExports;
  try {
    await deleteDoc(doc(db, 'users', userId, 'friends', friendUid));
    await deleteDoc(doc(db, 'users', friendUid, 'friends', userId));
  } catch (err) {
    console.error('[Firebase] Failed to remove friend:', err);
    throw err;
  }
}

export function subscribeToFriendsList(userId, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { collection, onSnapshot } = firestoreExports;
    const ref = collection(db, 'users', userId, 'friends');
    unsub = onSnapshot(ref, (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      onUpdate(list);
    }, (err) => {
      console.error('[Firebase] Friends list sub error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

export function subscribeToFriendRequests(userId, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { collection, onSnapshot } = firestoreExports;
    const ref = collection(db, 'users', userId, 'friend_requests');
    unsub = onSnapshot(ref, (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      onUpdate(list);
    }, (err) => {
      console.error('[Firebase] Friend requests sub error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

export function subscribeToFriendStatus(friendUid, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { doc, onSnapshot } = firestoreExports;
    const ref = doc(db, 'users', friendUid);
    unsub = onSnapshot(ref, (snap) => {
      onUpdate(snap.exists() ? snap.data() : null);
    }, (err) => {
      console.error('[Firebase] Friend status sub error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

export async function updateUserStatusInCloud(userId, status, activePartyId = null, activeWatchMedia = null) {
  await ensureFirebaseInitialized();
  const { doc, updateDoc, serverTimestamp } = firestoreExports;
  try {
    const ref = doc(db, 'users', userId);
    await updateDoc(ref, {
      status,
      activePartyId,
      activeWatchMedia,
      lastStatusUpdate: serverTimestamp()
    });
  } catch (err) {
    console.error('[Firebase] Failed to update user status:', err);
  }
}

// ========================================
// Firestore: Party Invite Notifications
// ========================================

export async function sendPartyInviteNotification(senderUid, senderName, senderAvatar, targetEmail, partyId, mediaTitle, posterPath, mediaType) {
  await ensureFirebaseInitialized();
  const { collection, query, where, getDocs, doc, setDoc, serverTimestamp } = firestoreExports;
  try {
    const q = query(collection(db, 'users'), where('email', '==', targetEmail.toLowerCase().trim()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('No user found with this email.');
    
    const targetUid = snap.docs[0].id;
    const notifId = `invite_${partyId}_${Date.now()}`;
    const notifRef = doc(db, 'users', targetUid, 'party_notifications', notifId);
    
    await setDoc(notifRef, {
      id: notifId,
      partyId,
      mediaTitle,
      posterPath,
      mediaType,
      hostName: senderName,
      hostAvatar: senderAvatar,
      hostUid: senderUid,
      status: 'pending',
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('[Firebase] Failed to send invite notification:', err);
    throw err;
  }
}

export function subscribeToPartyNotifications(userId, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { collection, query, where, onSnapshot } = firestoreExports;
    const ref = collection(db, 'users', userId, 'party_notifications');
    const q = query(ref, where('status', '==', 'pending'));
    unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      onUpdate(list);
    }, (err) => {
      console.error('[Firebase] Party notifications sub error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

export async function respondToPartyInvite(userId, notificationId, status) {
  await ensureFirebaseInitialized();
  const { doc, updateDoc } = firestoreExports;
  try {
    const ref = doc(db, 'users', userId, 'party_notifications', notificationId);
    await updateDoc(ref, { status });
  } catch (err) {
    console.error('[Firebase] Failed to respond to party invite:', err);
    throw err;
  }
}

// ========================================
// Firestore: Party History logs
// ========================================

export async function addPartyHistoryToCloud(userId, historyData) {
  await ensureFirebaseInitialized();
  const { collection, addDoc, serverTimestamp } = firestoreExports;
  try {
    const ref = collection(db, 'users', userId, 'party_history');
    await addDoc(ref, {
      ...historyData,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('[Firebase] Failed to add party history:', err);
  }
}

export async function fetchPartyHistoryFromCloud(userId) {
  await ensureFirebaseInitialized();
  const { collection, getDocs } = firestoreExports;
  try {
    const ref = collection(db, 'users', userId, 'party_history');
    const snap = await getDocs(ref);
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    // Sort by timestamp descending
    list.sort((a, b) => {
      const ta = a.timestamp?.toMillis?.() ?? 0;
      const tb = b.timestamp?.toMillis?.() ?? 0;
      return tb - ta;
    });
    return list;
  } catch (err) {
    console.error('[Firebase] Failed to fetch party history:', err);
    return [];
  }
}

// ========================================
// Firestore: Scheduled Parties
// ========================================

export async function createScheduledPartyInCloud(partyId, partyData) {
  await ensureFirebaseInitialized();
  const { doc, setDoc, serverTimestamp } = firestoreExports;
  try {
    const ref = doc(db, 'scheduled_parties', partyId);
    await setDoc(ref, {
      ...partyData,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error('[Firebase] Failed to create scheduled party:', err);
    throw err;
  }
}

export function subscribeToScheduledParties(userId, userEmail, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { collection, onSnapshot } = firestoreExports;
    const ref = collection(db, 'scheduled_parties');
    unsub = onSnapshot(ref, (snap) => {
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        const isHost = data.hostId === userId;
        const isInvited = Array.isArray(data.invitees) && data.invitees.map(i => i.toLowerCase().trim()).includes(userEmail.toLowerCase().trim());
        if (isHost || isInvited) {
          list.push({ id: d.id, ...data });
        }
      });
      onUpdate(list);
    }, (err) => {
      console.error('[Firebase] Scheduled parties sub error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

export async function deleteScheduledPartyInCloud(partyId) {
  await ensureFirebaseInitialized();
  const { doc, deleteDoc } = firestoreExports;
  try {
    const ref = doc(db, 'scheduled_parties', partyId);
    await deleteDoc(ref);
  } catch (err) {
    console.error('[Firebase] Failed to delete scheduled party:', err);
    throw err;
  }
}

// ========================================
// Firestore: Closed Room Join Requests
// ========================================

export async function sendJoinRequestInCloud(partyId, user) {
  await ensureFirebaseInitialized();
  const { doc, setDoc, serverTimestamp } = firestoreExports;
  try {
    const ref = doc(db, 'watch_parties', partyId, 'join_requests', user.uid);
    await setDoc(ref, {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0] || 'Guest',
      avatar: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60',
      status: 'pending',
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('[Firebase] Failed to send join request:', err);
    throw err;
  }
}

export function subscribeToJoinRequests(partyId, onUpdate) {
  let unsub = null;
  const promise = ensureFirebaseInitialized().then(() => {
    const { collection, onSnapshot } = firestoreExports;
    const ref = collection(db, 'watch_parties', partyId, 'join_requests');
    unsub = onSnapshot(ref, (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      onUpdate(list);
    }, (err) => {
      console.error('[Firebase] Join requests sub error:', err);
    });
  });
  return () => {
    if (unsub) unsub();
    else promise.then(() => { if (unsub) unsub(); });
  };
}

export async function respondToJoinRequestInCloud(partyId, guestMember, accept) {
  await ensureFirebaseInitialized();
  const { doc, deleteDoc } = firestoreExports;
  try {
    if (accept) {
      await joinWatchPartyInCloud(partyId, { ...guestMember, role: 'guest' });
    }
    await deleteDoc(doc(db, 'watch_parties', partyId, 'join_requests', guestMember.uid));
  } catch (err) {
    console.error('[Firebase] Failed to respond to join request:', err);
    throw err;
  }
}

