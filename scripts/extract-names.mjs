// Filtert Städtenamen in den App-Sprachen aus GeoNames alternateNamesV2.txt (über stdin).
// Aufruf: tar -xOf alternateNamesV2.zip alternateNamesV2.txt | node scripts/extract-names.mjs <cities15000.txt> <out.json>
import { writeFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const LANGS = ['de', 'en', 'fr', 'es'];
const [citiesPath, outPath] = process.argv.slice(2);
if (!citiesPath || !outPath) {
  console.error('Aufruf: node extract-names.mjs <cities15000.txt> <out.json>');
  process.exit(1);
}

const ids = new Set(
  readFileSync(citiesPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t', 1)[0]),
);

// Spalten: alternateNameId, geonameid, isolanguage, name, isPreferred, isShort, isColloquial, isHistoric, from, to
const best = new Map(); // `${id}|${lang}` -> { name, score }
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  const c = line.split('\t');
  if (!LANGS.includes(c[2]) || !ids.has(c[1])) continue;
  if (c[6] === '1' || c[7] === '1') continue; // umgangssprachlich / historisch
  const score = (c[4] === '1' ? 2 : 0) + (c[5] === '1' ? 1 : 0);
  const key = `${c[1]}|${c[2]}`;
  const prev = best.get(key);
  if (!prev || score > prev.score) best.set(key, { name: c[3], score });
}

const out = {};
for (const [key, v] of best) {
  const [id, lang] = key.split('|');
  (out[id] ??= {})[lang] = v.name;
}
writeFileSync(outPath, JSON.stringify(out));
console.log(`Städte mit übersetzten Namen: ${Object.keys(out).length}`);
