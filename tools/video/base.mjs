// Turns a raid-bot take (frames + timestamps) into a constant 30 fps video.
//   node tools/video/base.mjs <take dir>   ->  <take dir>/base.mp4
// Second 0 of base.mp4 is the first frame; events.json times map to it via frames[0].t.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = path.resolve(process.argv[2]);
const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
const lines = ['ffconcat version 1.0'];
frames.forEach((f, i) => {
  lines.push(`file 'frames/${f.file}'`);
  // A frame lasts until the next one arrives (the screencast only sends changes).
  const next = frames[i + 1]?.t ?? f.t + 1000;
  lines.push(`duration ${((next - f.t) / 1000).toFixed(4)}`);
});
lines.push(`file 'frames/${frames.at(-1).file}'`);
fs.writeFileSync(path.join(dir, 'frames.ffconcat'), lines.join('\n'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.ffconcat',
  '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', 'base.mp4'], { cwd: dir, stdio: 'inherit' });
console.log('base.mp4', ((frames.at(-1).t - frames[0].t) / 1000 + 1).toFixed(1), 's');
