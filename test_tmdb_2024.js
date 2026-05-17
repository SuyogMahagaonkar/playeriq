import axios from 'axios';

async function testTMDB() {
  const title = 'The Boys';
  const year = '2024';
  const apiKey = '8e4ad9e56e31ab079517b5be6965b477';
  
  const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(title)}&first_air_date_year=${year}`;
  const searchRes = await axios.get(searchUrl);
  const tvResults = searchRes.data.results || [];
  
  console.log(`Found ${tvResults.length} results for ${title} ${year}`);
  if (tvResults.length > 0) {
    console.log('First result ID:', tvResults[0].id, 'Name:', tvResults[0].name);
  }
}

testTMDB();
