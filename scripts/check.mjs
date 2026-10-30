import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const file of readdirSync('public').filter(f => f.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', `public/${file}`], {stdio: 'inherit'});
}
const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
if (config.outputDirectory !== 'public') throw Error('Unexpected output directory');
const html = readFileSync('public/index.html', 'utf8');
for (const [, path] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^https?:/.test(path)) readFileSync(`public/${path}`);
}
console.log('JavaScript syntax, Vercel config and local HTML assets passed.');

for (const dir of ['backend/api', 'backend/lib']) {
  for (const file of readdirSync(dir).filter(f => /\.(?:js|cjs)$/.test(f))) {
    execFileSync(process.execPath, ['--check', `${dir}/${file}`], {stdio: 'inherit'});
  }
}
JSON.parse(readFileSync('backend/vercel.json', 'utf8'));
console.log('Backend syntax and Vercel JSON passed.');
