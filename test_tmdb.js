import axios from 'axios';

async function testTMDB() {
  try {
    const apiKey = '8e4ad9e56e31ab079517b5be6965b477';
    const imdbId = 'tt1190634';
    
    console.log('1. Finding TMDB ID...');
    const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
    const findRes = await axios.get(findUrl);
    const tvResults = findRes.data.tv_results || [];
    
    if (tvResults.length === 0) {
      console.log('TV show not found on TMDB');
      return;
    }
    
    const tmdbId = tvResults[0].id;
    console.log(`2. Found TMDB ID: ${tmdbId}. Fetching season 1...`);
    
    const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/1?api_key=${apiKey}`;
    const seasonRes = await axios.get(seasonUrl);
    
    console.log('3. Success!');
    console.log(seasonRes.data.episodes.slice(0, 1).map(ep => ({
      episode_number: ep.episode_number,
      name: ep.name,
      still_path: ep.still_path
    })));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testTMDB();
