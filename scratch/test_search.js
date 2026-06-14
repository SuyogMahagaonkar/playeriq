import axios from 'axios';

async function test() {
  try {
    const tmdbId = '12345'; // We don't know the tmdb ID yet, but let's query TMDB search first
    const title = "Daadi Ki Shaadi";
    const apiKey = '8e4ad9e56e31ab079517b5be6965b477';
    
    // Search TMDB
    const tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}`);
    console.log('TMDB Search Results:', JSON.stringify(tmdbRes.data.results, null, 2));
    
    // Search MovieBox
    const mbRes = await axios.get(`http://localhost:8788/api/moviebox/search?q=${encodeURIComponent(title)}&type=1&safe=false`);
    console.log('MovieBox Search Results:', JSON.stringify(mbRes.data, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
