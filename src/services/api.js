// ========================================
// PlayerIQ — Native MovieBox API Service
// ========================================

export const NODE_PROXY = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://playerapi.suyogmahagaonkar.me';

// Image size helpers
export const img = {
  poster: (path) => path?.startsWith('/') ? `https://image.tmdb.org/t/p/w500${path}` : path,
  backdrop: (path) => path?.startsWith('/') ? `https://image.tmdb.org/t/p/original${path}` : path,
  profile: (path) => path?.startsWith('/') ? `https://image.tmdb.org/t/p/w185${path}` : path,
  still: (path) => path?.startsWith('/') ? `https://image.tmdb.org/t/p/w500${path}` : path,
};

function isSafeSearchOn() {
  const pref = localStorage.getItem('piq_safesearch');
  return pref !== 'false'; // default to true
}

let cachedHomeData = null;
let cachedHomeSafeState = null;

export async function getMovieBoxHome(forceRefresh = false) {
  const currentSafe = isSafeSearchOn();
  if (cachedHomeData && !forceRefresh && cachedHomeSafeState === currentSafe) {
    return cachedHomeData;
  }
  const safeParam = currentSafe ? '?safe=true' : '?safe=false';
  const res = await fetch(`${NODE_PROXY}/api/moviebox/home${safeParam}`);
  if (!res.ok) throw new Error('Failed to fetch home');
  cachedHomeData = await res.json();
  cachedHomeSafeState = currentSafe;
  return cachedHomeData;
}

export const getMovieDetails = async (id) => {
  if (!String(id).startsWith('mb_')) {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=8e4ad9e56e31ab079517b5be6965b477&append_to_response=similar,recommendations`);
    if (!res.ok) throw new Error('TMDB details failed');
    return res.json();
  }
  
  const subjectId = String(id).replace('mb_', '');
  const res = await fetch(`${NODE_PROXY}/api/moviebox/info/${subjectId}`);
  if (!res.ok) throw new Error('MovieBox details failed');
  const data = await res.json();
  
  return {
    id: `mb_${subjectId}`,
    title: data.title,
    runtime: data.durationSeconds ? Math.floor(data.durationSeconds / 60) : 0,
    vote_average: data.imdbRatingValue ? parseFloat(data.imdbRatingValue) : null,
    overview: data.description || '',
    release_date: data.releaseDate || '',
    genres: data.genre ? data.genre.split(',').map(g => ({ name: g.trim() })) : [],
    poster_path: data.cover?.url || data.coverUrl || null,
    backdrop_path: data.cover?.url || data.coverUrl || null,
    similar: { results: [] },
    seasons: [],
    raw_data: data
  };
};

export const getTVDetails = async (id) => {
  if (!String(id).startsWith('mb_')) {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=8e4ad9e56e31ab079517b5be6965b477&append_to_response=similar,recommendations`);
    if (!res.ok) throw new Error('TMDB tv details failed');
    const data = await res.json();
    return {
      ...data,
      seasons: (data.seasons || []).map(s => ({
        season_number: s.season_number,
        name: s.name,
        episode_count: s.episode_count
      }))
    };
  }

  const subjectId = String(id).replace('mb_', '');
  const [infoRes, seasonsRes] = await Promise.all([
    fetch(`${NODE_PROXY}/api/moviebox/info/${subjectId}`),
    fetch(`${NODE_PROXY}/api/moviebox/seasons/${subjectId}`)
  ]);
  if (!infoRes.ok) throw new Error('MovieBox details failed');
  const data = await infoRes.json();
  
  let seasonsData = { seasons: [] };
  if (seasonsRes.ok) {
    seasonsData = await seasonsRes.json();
  }
  
  const seasons = (seasonsData.seasons || []).map(s => ({
    season_number: s.se,
    name: `Season ${s.se}`,
    episode_count: s.maxEp
  }));

  return {
    id: `mb_${subjectId}`,
    name: data.title,
    runtime: data.durationSeconds ? Math.floor(data.durationSeconds / 60) : 0,
    vote_average: data.imdbRatingValue ? parseFloat(data.imdbRatingValue) : null,
    overview: data.description || '',
    first_air_date: data.releaseDate || '',
    genres: data.genre ? data.genre.split(',').map(g => ({ name: g.trim() })) : [],
    poster_path: data.cover?.url || data.coverUrl || null,
    backdrop_path: data.cover?.url || data.coverUrl || null,
    similar: { results: [] },
    seasons: seasons,
    raw_data: data
  };
};

export const getSeasonDetails = async (tvId, seasonNumber, title = null, year = null) => {
  const subjectId = String(tvId).replace('mb_', '');
  
  // 1. If it is a TMDB ID, try official TMDB Season endpoint first (most reliable)
  if (!String(tvId).startsWith('mb_')) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}?api_key=8e4ad9e56e31ab079517b5be6965b477`);
      if (res.ok) {
        const data = await res.json();
        if (data.episodes && data.episodes.length > 0) {
          return { episodes: data.episodes };
        }
      }
    } catch (e) {
      console.warn('Failed TMDB official season fetch, falling back to proxy search', e);
    }
  }

  // 2. Try proxy search using title and season (highly reliable for MovieBox items)
  if (title) {
    try {
      const query = `?title=${encodeURIComponent(title)}&season=${seasonNumber}${year ? `&year=${year}` : ''}&tvId=${tvId}`;
      const res = await fetch(`${NODE_PROXY}/api/tmdb/episodes${query}`);
      if (res.ok) {
        const data = await res.json();
        if (data.episodes && data.episodes.length > 0) {
          return { episodes: data.episodes };
        }
      }
    } catch (e) {
      console.warn('Failed to fetch TMDB episodes, falling back to direct search');
    }
  }

  // 3. Search TMDB directly by title as a last-resort TMDB fallback if tvId starts with mb_
  if (title) {
    try {
      const searchRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&query=${encodeURIComponent(title)}${year ? `&first_air_date_year=${year}` : ''}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const tmdbTv = searchData.results?.[0];
        if (tmdbTv) {
          const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbTv.id}/season/${seasonNumber}?api_key=8e4ad9e56e31ab079517b5be6965b477`);
          if (res.ok) {
            const data = await res.json();
            if (data.episodes && data.episodes.length > 0) {
              return { episodes: data.episodes };
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed TMDB direct search fallback', e);
    }
  }

  // 4. Try MovieBox seasons fallback
  try {
    const res = await fetch(`${NODE_PROXY}/api/moviebox/seasons/${subjectId}`);
    if (res.ok) {
      const data = await res.json();
      const seasonData = (data.seasons || []).find(s => s.se === parseInt(seasonNumber));
      const maxEp = seasonData?.maxEp || 1;
      
      const episodes = [];
      for (let i = 1; i <= maxEp; i++) {
        episodes.push({ 
          episode_number: i, 
          name: `Episode ${i}`, 
          runtime: null,
          overview: '' 
        });
      }
      return { episodes };
    }
  } catch (e) {
    console.warn('MovieBox seasons fetch failed, falling back to absolute safe defaults');
  }

  // 5. Hard safe fallback: return placeholder episodes so navigation never crashes!
  const episodes = [];
  for (let i = 1; i <= 24; i++) {
    episodes.push({
      episode_number: i,
      name: `Episode ${i}`,
      runtime: 45,
      overview: 'Episode details are currently offline.'
    });
  }
  return { episodes };
};

export async function searchMovieBox(query, type = 'all') {
  const safeParam = isSafeSearchOn() ? '&safe=true' : '&safe=false';
  const url = `${NODE_PROXY}/api/moviebox/search?q=${encodeURIComponent(query)}&type=${type}${safeParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MovieBox search failed: ${res.status}`);
  return res.json();
}

export async function getLatestNetflix(page = 1) {
  const isSafe = isSafeSearchOn();
  const [moviesRes, tvRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=8&watch_region=IN&sort_by=popularity.desc&page=${page}`),
    fetch(`https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=8&watch_region=IN&sort_by=popularity.desc&page=${page}`)
  ]);
  const [movies, tvs] = await Promise.all([moviesRes.json(), tvRes.json()]);
  
  const mixed = [];
  const max = Math.max((movies.results || []).length, (tvs.results || []).length);
  for (let i = 0; i < max; i++) {
    if (movies.results?.[i]) {
      mixed.push({ ...movies.results[i], media_type: 'movie' });
    }
    if (tvs.results?.[i]) {
      mixed.push({ ...tvs.results[i], media_type: 'tv' });
    }
  }
  return { results: mixed };
}

export async function getLatestPrime(page = 1) {
  const isSafe = isSafeSearchOn();
  const [moviesRes, tvRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=119&watch_region=IN&sort_by=popularity.desc&page=${page}`),
    fetch(`https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=119&watch_region=IN&sort_by=popularity.desc&page=${page}`)
  ]);
  const [movies, tvs] = await Promise.all([moviesRes.json(), tvRes.json()]);
  
  const mixed = [];
  const max = Math.max((movies.results || []).length, (tvs.results || []).length);
  for (let i = 0; i < max; i++) {
    if (movies.results?.[i]) {
      mixed.push({ ...movies.results[i], media_type: 'movie' });
    }
    if (tvs.results?.[i]) {
      mixed.push({ ...tvs.results[i], media_type: 'tv' });
    }
  }
  return { results: mixed };
}

export async function getWatchProviders(id, type, title = null) {
  let tmdbId = id;
  if (String(id).startsWith('mb_')) {
    if (!title) return null;
    try {
      const searchRes = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=8e4ad9e56e31ab079517b5be6965b477&query=${encodeURIComponent(title)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.results?.[0]) {
          tmdbId = searchData.results[0].id;
        } else {
          return null;
        }
      }
    } catch (e) {
      return null;
    }
  }
  
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/watch/providers?api_key=8e4ad9e56e31ab079517b5be6965b477`);
    if (res.ok) {
      const data = await res.json();
      const providers = data.results?.IN || data.results?.US || Object.values(data.results || {})[0];
      return providers || null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

export async function getTop10Movies() {
  const res = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=8e4ad9e56e31ab079517b5be6965b477&page=1`);
  if (!res.ok) throw new Error('Failed to fetch top 10 movies');
  const data = await res.json();
  return { results: (data.results || []).slice(0, 10) };
}

export async function getTop10Series() {
  const res = await fetch(`https://api.themoviedb.org/3/tv/popular?api_key=8e4ad9e56e31ab079517b5be6965b477&page=1`);
  if (!res.ok) throw new Error('Failed to fetch top 10 series');
  const data = await res.json();
  return { results: (data.results || []).slice(0, 10) };
}
