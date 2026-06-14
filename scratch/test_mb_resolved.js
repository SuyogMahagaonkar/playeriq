import axios from 'axios';

async function test() {
  try {
    const title = "Daadi Ki Shaadi";
    
    // Search MovieBox
    console.log('Searching MovieBox for Daadi Ki Shaadi...');
    const searchRes = await axios.get(`http://localhost:8788/api/moviebox/search?q=${encodeURIComponent(title)}&type=1&safe=false`);
    console.log('MovieBox Search Results:', JSON.stringify(searchRes.data.results, null, 2));

    if (searchRes.data.results && searchRes.data.results.length > 0) {
      const mbId = searchRes.data.results[0].id;
      console.log(`\nQuerying stream for resolved MovieBox ID: mb_${mbId}...`);
      const streamRes = await axios.get(`http://localhost:8788/api/stream/movie/mb_${mbId}`);
      console.log('Stream Status:', streamRes.status);
      console.log('Stream Url:', streamRes.data.url);
    }
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
