import fs from 'fs';

const content = fs.readFileSync('src/components/VideoPlayer.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('cast') || line.includes('Cast') || line.includes('CAST')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
