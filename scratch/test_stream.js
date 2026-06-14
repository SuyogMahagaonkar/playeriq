import axios from 'axios';

async function test() {
  try {
    const tmdbId = '1464795'; // Daadi Ki Shaadi TMDB ID
    
    console.log('Querying stream for Daadi Ki Shaadi (TMDB ID: 1464795)...');
    const res = await axios.get(`http://localhost:8788/api/stream/movie/${tmdbId}`);
    console.log('Stream API Response Status:', res.status);
    console.log('Stream API Response:', JSON.stringify(res.data, null, 2));

  } catch (err) {
    if (err.response) {
      console.error('Error Response Status:', err.response.status);
      console.error('Error Response Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error:', err.message);
    }
  }
}

test();
