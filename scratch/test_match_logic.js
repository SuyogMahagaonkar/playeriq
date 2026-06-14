import axios from 'axios';

async function test() {
  try {
    const title = "Daadi Ki Shaadi";
    const res = await axios.get(`http://localhost:8788/api/moviebox/search?q=${encodeURIComponent(title)}&type=1&safe=false`);
    console.log('Total results:', res.data.results.length);
    console.log('First 3 results:', JSON.stringify(res.data.results.slice(0, 3), null, 2));

    const cleanTitle = "Daadi Ki Shaadi";
    const year = "2026";
    
    // Simulating match logic
    const cleanedTarget = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    console.log('\nTarget clean:', cleanedTarget);
    
    for (const item of res.data.results) {
      const cleanedItem = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const itemYear = (item.releaseDate || item.release_date || item.year || '').slice(0, 4);
      console.log(`Checking "${item.title}" -> Cleaned: "${cleanedItem}" | Year: "${itemYear}"`);
      const yearMatches = !year || !itemYear || year === itemYear;
      if (yearMatches && (cleanedTarget === cleanedItem || cleanedTarget.includes(cleanedItem) || cleanedItem.includes(cleanedTarget))) {
        console.log('Match Found!', item.title, 'ID:', item.id);
        break;
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
