// ========================================
// PlayerIQ — Native MovieBox API Service
// ========================================

export const NODE_PROXY = 'http://localhost:8788';

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

export async function getMovieBoxHome() {
  const safeParam = isSafeSearchOn() ? '?safe=true' : '?safe=false';
  const res = await fetch(`${NODE_PROXY}/api/moviebox/home${safeParam}`);
  if (!res.ok) throw new Error('Failed to fetch home');
  return res.json();
}

export const getMovieDetails = async (id) => {
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
  
  if (title) {
    try {
      const query = `?title=${encodeURIComponent(title)}&season=${seasonNumber}${year ? `&year=${year}` : ''}`;
      const res = await fetch(`${NODE_PROXY}/api/tmdb/episodes${query}`);
      if (res.ok) {
        const data = await res.json();
        if (data.episodes && data.episodes.length > 0) {
          return { episodes: data.episodes };
        }
      }
    } catch (e) {
      console.warn('Failed to fetch TMDB episodes, falling back to MovieBox dummy data');
    }
  }

  const res = await fetch(`${NODE_PROXY}/api/moviebox/seasons/${subjectId}`);
  if (!res.ok) throw new Error('MovieBox seasons failed');
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
};

export async function searchMovieBox(query, type = 'all') {
  const safeParam = isSafeSearchOn() ? '&safe=true' : '&safe=false';
  const url = `${NODE_PROXY}/api/moviebox/search?q=${encodeURIComponent(query)}&type=${type}${safeParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MovieBox search failed: ${res.status}`);
  return res.json();
}
