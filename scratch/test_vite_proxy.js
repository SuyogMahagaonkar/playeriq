import axios from 'axios';

async function test() {
  try {
    const tmdbId = 'mb_1452107859684116504';
    console.log('Querying stream via Vite Dev Server (port 3000)...');
    const res = await axios.get(`http://localhost:3000/api/stream/movie/${tmdbId}`);
    console.log('Vite Proxy Stream Status:', res.status);
    console.log('Vite Proxy Stream Response:', JSON.stringify(res.data, null, 2));

  } catch (err) {
    if (err.response) {
      console.error('Error Status:', err.response.status);
      console.error('Error Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Error:', err.message);
    }
  }
}

test();
