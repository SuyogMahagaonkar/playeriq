// ========================================
// PlayerIQ — Local Storage Service
// ========================================
// These functions are used as a LOCAL fallback when the user is not signed in.
// When signed in, the auth.js service routes data to Firestore instead.

const STORAGE_KEY = 'piq_continue_watching';
const MAX_HISTORY = 20;

/**
 * Save watch progress to local storage (fallback for signed-out users)
 * @param {Object} media - { id, title, type, poster_path, season, episode }
 */
export function saveProgressLocal(media) {
  try {
    let history = getProgress();

    // Remove existing entry for the same media ID
    history = history.filter(item => item.id !== media.id);

    // Add new entry to the front
    history.unshift({
      id: media.id,
      title: media.title || media.name,
      type: media.type,
      poster_path: media.poster_path,
      backdrop_path: media.backdrop_path,
      season: media.season || 1,
      episode: media.episode || 1,
      currentTime: media.currentTime || 0,
      duration: media.duration || 0,
      timestamp: Date.now()
    });

    // Cap history size
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save progress locally', err);
  }
}

// Keep the old name as an alias so any existing callers don't break
export const saveProgress = saveProgressLocal;

/**
 * Get watch progress from local storage
 * @returns {Array} List of watched media
 */
export function getProgress() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to read local progress', err);
    return [];
  }
}

/**
 * Remove a specific item from local progress
 */
export function removeProgressLocal(id) {
  try {
    let history = getProgress();
    history = history.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to remove local progress', err);
  }
}

// Keep old name as alias
export const removeProgress = removeProgressLocal;

/**
 * Clear all local watch history (called after migration to Firestore)
 */
export function clearProgressLocal() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear local progress', err);
  }
}
