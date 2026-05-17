import { MOVIES } from '@consumet/extensions';

async function test() {
  try {
    const flixhq = new MOVIES.FlixHQ();
    
    // Search for The Avengers (2012)
    console.log('Searching...');
    const searchRes = await flixhq.search('The Avengers');
    const movie = searchRes.results.find(m => m.type === 'Movie');
    if (!movie) return console.log('No movie found');
    console.log('Found:', movie.title, movie.id);
    
    // Get info/episodes
    console.log('Fetching info...');
    const info = await flixhq.fetchMediaInfo(movie.id);
    const episodeId = info.episodes[0].id;
    
    // Get stream
    console.log('Fetching stream for episode:', episodeId);
    const stream = await flixhq.fetchEpisodeSources(episodeId, movie.id);
    console.log('Stream result:', JSON.stringify(stream, null, 2));
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
