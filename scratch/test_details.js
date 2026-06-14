import axios from 'axios';

async function test() {
  try {
    const tmdbId = '1464795'; // Daadi Ki Shaadi TMDB ID
    const apiKey = '8e4ad9e56e31ab079517b5be6965b477';
    
    const res = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=external_ids`);
    console.log('TMDB details response:', JSON.stringify(res.data, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
