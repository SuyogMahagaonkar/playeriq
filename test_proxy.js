import axios from 'axios';

async function testProxy() {
  try {
    const res = await axios.get('http://localhost:8788/api/tmdb/episodes?title=The%20Boys&year=2024&season=1');
    console.log(res.data);
  } catch (err) {
    console.error(err.message);
  }
}

testProxy();
