import fs from 'fs';
import path from 'path';

const playerCss = fs.readFileSync('src/styles/player.css', 'utf8');
const lines = playerCss.split('\n');

console.log('Searching in player.css:');
lines.forEach((line, idx) => {
  if (line.includes('cast-') || line.includes('session-bar')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

const responsiveCss = fs.readFileSync('src/styles/responsive.css', 'utf8');
const rLines = responsiveCss.split('\n');
console.log('\nSearching in responsive.css:');
rLines.forEach((line, idx) => {
  if (line.includes('cast-') || line.includes('session-bar')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
