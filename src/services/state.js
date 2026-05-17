// ========================================
// PlayerIQ — Simple State Store
// ========================================

const state = {
  searchQuery: '',
  selectedGenre: null,
  recentSearches: JSON.parse(localStorage.getItem('piq_recent_searches') || '[]'),
};

const listeners = new Map();

export function getState(key) {
  return state[key];
}

export function setState(key, value) {
  state[key] = value;
  if (key === 'recentSearches') {
    localStorage.setItem('piq_recent_searches', JSON.stringify(value));
  }
  // Notify listeners
  const fns = listeners.get(key);
  if (fns) fns.forEach(fn => fn(value));
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

export function addRecentSearch(query) {
  const recent = getState('recentSearches').filter(q => q !== query);
  recent.unshift(query);
  setState('recentSearches', recent.slice(0, 8));
}
