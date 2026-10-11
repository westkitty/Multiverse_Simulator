import { readFileSync, readdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = '/Multiverse_Simulator/';
const html = readFileSync('dist/index.html', 'utf8');
const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
assert(urls.length > 0, 'No built assets');
for (const url of urls) {
  assert(url.startsWith(base), `Asset outside project base: ${url}`);
  assert(existsSync(`dist/${url.slice(base.length)}`), `Missing asset: ${url}`);
}
const assets = readdirSync('dist/assets');
const worker = assets.find(name => /^simulation\.worker-.*\.js$/.test(name));
assert(worker, 'Missing built module worker');
const scripts = assets.filter(name => name.endsWith('.js')).map(name => readFileSync(`dist/assets/${name}`, 'utf8'));
assert(scripts.some(text => text.includes(`${base}assets/${worker}`)), 'Worker URL does not use project base');
assert(!html.includes('/src/'), 'Raw source in production HTML');
console.log(`PASS: ${urls.length} HTML assets and module worker resolve under ${base}`);
