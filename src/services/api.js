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

export function isSafeItem(item) {
  if (!item) return false;

  // TMDB adult flag
  if (item.adult === true) return false;
  
  // Get title, overview/description, and genre
  const title = (item.title || item.name || '').toLowerCase();
  const overview = (item.overview || item.description || '').toLowerCase();
  
  // Clean genres string or check array
  let genresStr = '';
  if (typeof item.genres === 'string') {
    genresStr = item.genres;
  } else if (Array.isArray(item.genres)) {
    genresStr = item.genres.map(g => g.name || g).join(' ');
  } else if (item.genre) {
    genresStr = String(item.genre);
  }
  genresStr = genresStr.toLowerCase();

  // 1. Explicit Genre Blocks
  const badGenres = ['erotica', 'adult', 'softcore', 'porn', 'sensual', '18+', 'vivamax', 'viva max', 'pinoy softcore', 'tagalog erotic', 'hentai', 'tl anime', 'anime 18+', 'adult anime'];
  for (const bg of badGenres) {
    if (genresStr.includes(bg)) return false;
  }

  // 2. Exact Title Blocks
  const exactBlocks = ['romance', 'tl'];
  if (exactBlocks.includes(title)) {
    return false;
  }

  // 3. Substring Blocks
  const badSubstrings = [
    '18+', '18plus', '18 plus', 'r-18', 'r18', 'xxx', 'softcore',
    'porn', 'brazzers', 'nudity', 'striptease', 'kamasutra', 'hentai',
    'bhabhi', 'bhabi', 'tharki', 'mastram', 'jalebi bai', 'charmsukh',
    'palang tod', 'riti riwaj', 'siskiyan', 'sursuri', 'gandii baat',
    'khuli khidki', 'cuckold', 'swinger', 'playboy', 'sensual desire',
    'hot scene', 'bedroom scene', 'unrated version', 'uncut version',
    'ullu', 'kooku', 'nuefliks', 'hotshots', 'fliz', 'rabbit movies',
    'primeplay', 'neonx', 'hotmasti', 'fappot', 'glowmax', 'cinemadosti',
    'chikooflix', 'gupchup', 'altbalaji', 'vivamax', 'viva max', 'jav',
    'sex movie', 'sex scene', 'sex video', 'sex show', 'sex tape',
    'hardcore sex', 'lesbian sex', 'gay sex', 'desi hot', 'desi sexy',
    'desi bhabhi', 'hot web series', '18+ web series', 'adult web series',
    'uncut web series', 'unrated web series', 'teens love'
  ];
  for (const sub of badSubstrings) {
    if (title.includes(sub) || overview.includes(sub) || genresStr.includes(sub)) {
      return false;
    }
  }

  // 4. Regex Word-Boundary Check for other explicit words
  const badTitleRegex = /\b(milf|erotic|erotica|nympho|orgasm|incest|nude|naked|seduction|adultery|adult\s?movie|adult\s?show|fap|slut|lust|eks|seva|sexa|2x1|borders\s?of\s?love|room\s?service|higop|next\s?room\s?affair|cheaters|kuch\s?pal\s?pyar\s?ke|boss\s?ma'am|bula|selina's\s?gold|virgin\s?forest|pamasahe|lulu|siklo|kara\s?cruz|hugot|pantaxa|pabuya|isla|taya|salamat\s?daks|mama\s?katsu|sulutan|kazuko|ala\s?ala|mayank|hatsukoi\s?jikan|seika|papa\s?katsu|kiss\s?&\s?kill|kiss\s?and\s?kill|99\s?moons|female\s?hostel|megane\s?no\s?megami|jalwa|tubero|big\s?and\s?black|trauma|sex\s?weather|you\s?will\s?regret\s?this|date\s?for\s?hire|pihit|city\s?girl|white\s?lily|romance\s?and\s?cegrete|romance\s?&\s?cegrete|nurse\s?abi|isapad|x-deal\s?2|sexy\s?ghotala|kaam\s?sastra|high\s?on\s?sex)\b/i;
  if (badTitleRegex.test(title) || badTitleRegex.test(overview)) {
    return false;
  }

  return true;
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
  let data = await res.json();

  if (currentSafe && data.items) {
    // 1. Filter out unwanted categories
    const unwantedRowRegex = /wwe|skill|course|cricket|anime|hentai|18\+|kids|learning|high-ctr/i;
    data.items = data.items.filter(row => {
      const title = (row.title || '').toLowerCase();
      return !unwantedRowRegex.test(title);
    });

    // 2. Filter subjects recursively
    data.items = data.items.map(row => {
      if (row.subjects) {
        row.subjects = row.subjects.filter(s => isSafeItem(s));
      }
      if (row.customData?.items) {
        row.customData.items = row.customData.items.filter(ci => isSafeItem(ci.subject));
      }
      if (row.banner?.banners) {
        row.banner.banners = row.banner.banners.filter(b => isSafeItem(b.subject));
      }
      return row;
    });
  }

  cachedHomeData = data;
  cachedHomeSafeState = currentSafe;
  return cachedHomeData;
}

export const getMovieDetails = async (id) => {
  let details = null;
  if (!String(id).startsWith('mb_')) {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=8e4ad9e56e31ab079517b5be6965b477&append_to_response=similar,recommendations`);
    if (!res.ok) throw new Error('TMDB details failed');
    details = await res.json();
  } else {
    const subjectId = String(id).replace('mb_', '');
    const res = await fetch(`${NODE_PROXY}/api/moviebox/info/${subjectId}`);
    if (!res.ok) throw new Error('MovieBox details failed');
    const data = await res.json();
    
    details = {
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
  }

  if (isSafeSearchOn() && !isSafeItem(details)) {
    throw new Error('This content is blocked by Safe Search');
  }

  return details;
};

export const getTVDetails = async (id) => {
  let details = null;
  if (!String(id).startsWith('mb_')) {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=8e4ad9e56e31ab079517b5be6965b477&append_to_response=similar,recommendations`);
    if (!res.ok) throw new Error('TMDB tv details failed');
    const data = await res.json();
    details = {
      ...data,
      seasons: (data.seasons || []).map(s => ({
        season_number: s.season_number,
        name: s.name,
        episode_count: s.episode_count
      }))
    };
  } else {
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

    details = {
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
  }

  if (isSafeSearchOn() && !isSafeItem(details)) {
    throw new Error('This content is blocked by Safe Search');
  }

  return details;
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
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getLatestNetflix(page = 1) {
  const isSafe = isSafeSearchOn();
  const [moviesRes, tvRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=8&watch_region=IN&sort_by=popularity.desc&page=${page}`),
    fetch(`https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=8&watch_region=IN&sort_by=popularity.desc&page=${page}`)
  ]);
  const [movies, tvs] = await Promise.all([moviesRes.json(), tvRes.json()]);
  
  let mixed = [];
  const max = Math.max((movies.results || []).length, (tvs.results || []).length);
  for (let i = 0; i < max; i++) {
    if (movies.results?.[i]) {
      mixed.push({ ...movies.results[i], media_type: 'movie' });
    }
    if (tvs.results?.[i]) {
      mixed.push({ ...tvs.results[i], media_type: 'tv' });
    }
  }

  if (isSafe) {
    mixed = mixed.filter(isSafeItem);
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
  
  let mixed = [];
  const max = Math.max((movies.results || []).length, (tvs.results || []).length);
  for (let i = 0; i < max; i++) {
    if (movies.results?.[i]) {
      mixed.push({ ...movies.results[i], media_type: 'movie' });
    }
    if (tvs.results?.[i]) {
      mixed.push({ ...tvs.results[i], media_type: 'tv' });
    }
  }

  if (isSafe) {
    mixed = mixed.filter(isSafeItem);
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
  let results = data.results || [];
  if (isSafeSearchOn()) {
    results = results.filter(isSafeItem);
  }
  return { results: results.slice(0, 10) };
}

export async function getTop10Series() {
  const res = await fetch(`https://api.themoviedb.org/3/tv/popular?api_key=8e4ad9e56e31ab079517b5be6965b477&page=1`);
  if (!res.ok) throw new Error('Failed to fetch top 10 series');
  const data = await res.json();
  let results = data.results || [];
  if (isSafeSearchOn()) {
    results = results.filter(isSafeItem);
  }
  return { results: results.slice(0, 10) };
}

export async function getTrendingMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=8e4ad9e56e31ab079517b5be6965b477&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch trending movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getTrendingTV(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=8e4ad9e56e31ab079517b5be6965b477&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch trending series');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getMediaImages(id, type, title = null) {
  let tmdbId = id;
  if (String(id).startsWith('mb_')) {
    if (!title) return null;
    const cleanTitle = title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
    try {
      const searchRes = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=8e4ad9e56e31ab079517b5be6965b477&query=${encodeURIComponent(cleanTitle)}`);
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
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=8e4ad9e56e31ab079517b5be6965b477&include_image_language=en,hi,null`);
    if (res.ok) {
      return res.json();
    }
  } catch (e) {
    console.warn('Failed to fetch media images:', e);
  }
  return null;
}

export async function getTrendingAll(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=8e4ad9e56e31ab079517b5be6965b477&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch trending all');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getBollywoodMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_original_language=hi&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Bollywood movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getSouthIndianMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_original_language=te|ta|kn|ml&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch South Indian movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getCinemaMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_original_language=en&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Cinema movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

// ========================================
// TMDB Genre Discover Services
// ========================================

export async function getHorrorMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_genres=27&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Horror movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getRomanceMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_genres=10749&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Romance movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getSciFiMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_genres=878&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Sci-Fi movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getKidsMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_genres=10751&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Family/Kids movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getComedyMovies(page = 1) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_genres=35&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Comedy movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

export async function getAnimeMovies(page = 1) {
  // TMDB Genre 16 is Animation, Japanese original language is specific to Japanese Anime!
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`);
  if (!res.ok) throw new Error('Failed to fetch Anime movies');
  let data = await res.json();
  if (isSafeSearchOn() && data.results) {
    data.results = data.results.filter(isSafeItem);
  }
  return data;
}

// ========================================
// TMDB Studios Discover Service
// ========================================

export async function getStudioContent(studioName, page = 1) {
  const isSafe = isSafeSearchOn();
  let urlMovies = '';
  let urlTv = '';
  
  const cleanName = studioName.toLowerCase().replace(/[^a-z0-9+]/g, '');
  
  if (cleanName.includes('disney')) {
    // Watch providers: 122 (Disney+ Hotstar IN) and 337 (Disney+ US)
    urlMovies = `https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=122|337&watch_region=IN&sort_by=popularity.desc&page=${page}`;
    urlTv = `https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=122|337&watch_region=IN&sort_by=popularity.desc&page=${page}`;
  } else if (cleanName.includes('hbo')) {
    // TV network 49 (HBO), Production company 3268 (HBO Films)
    urlMovies = `https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_companies=3268|9993&sort_by=popularity.desc&page=${page}`;
    urlTv = `https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_networks=49&sort_by=popularity.desc&page=${page}`;
  } else if (cleanName.includes('netflix')) {
    // Watch provider 8 (Netflix IN)
    urlMovies = `https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=8&watch_region=IN&sort_by=popularity.desc&page=${page}`;
    urlTv = `https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=8&watch_region=IN&sort_by=popularity.desc&page=${page}`;
  } else if (cleanName.includes('prime')) {
    // Watch provider 119 (Amazon Prime IN)
    urlMovies = `https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=119&watch_region=IN&sort_by=popularity.desc&page=${page}`;
    urlTv = `https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_watch_providers=119&watch_region=IN&sort_by=popularity.desc&page=${page}`;
  } else if (cleanName.includes('paramount')) {
    // Paramount Pictures company ID: 4, CBS network ID: 1025
    urlMovies = `https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_companies=4|34&sort_by=popularity.desc&page=${page}`;
    urlTv = `https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_networks=1025&sort_by=popularity.desc&page=${page}`;
  } else if (cleanName.includes('marvel')) {
    // Marvel Studios production company ID: 420
    urlMovies = `https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&with_companies=420&sort_by=popularity.desc&page=${page}`;
    urlTv = `https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&with_companies=420&sort_by=popularity.desc&page=${page}`;
  } else {
    urlMovies = `https://api.themoviedb.org/3/discover/movie?api_key=8e4ad9e56e31ab079517b5be6965b477&sort_by=popularity.desc&page=${page}`;
    urlTv = `https://api.themoviedb.org/3/discover/tv?api_key=8e4ad9e56e31ab079517b5be6965b477&sort_by=popularity.desc&page=${page}`;
  }

  const [moviesRes, tvRes] = await Promise.all([
    fetch(urlMovies),
    fetch(urlTv)
  ]);
  
  const [movies, tvs] = await Promise.all([
    moviesRes.ok ? moviesRes.json() : { results: [] },
    tvRes.ok ? tvRes.json() : { results: [] }
  ]);
  
  let mixed = [];
  const max = Math.max((movies.results || []).length, (tvs.results || []).length);
  for (let i = 0; i < max; i++) {
    if (movies.results?.[i]) {
      mixed.push({ ...movies.results[i], media_type: 'movie' });
    }
    if (tvs.results?.[i]) {
      mixed.push({ ...tvs.results[i], media_type: 'tv' });
    }
  }

  if (isSafe) {
    mixed = mixed.filter(isSafeItem);
  }

  return { results: mixed };
}

