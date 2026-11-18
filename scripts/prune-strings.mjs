// Schreibt src/lib/strings.ts neu: nur Übersetzungen, die im Code vorkommen (+ optional neue aus einer JSON-Datei).
// Aufruf: node scripts/prune-strings.mjs [neue-texte.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f) && !p.endsWith('strings.ts')) files.push(p);
  }
};
walk('src');

const lit = `'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"`;
const used = new Set();
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"');
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(new RegExp(`\\b(?:t|tr)\\(\\s*(?:${lit})`, 'g'))) used.add(unescape(m[1] ?? m[2]));
  for (const m of s.matchAll(new RegExp(`\\bt[nw]\\(\\s*[^,]+,\\s*(?:${lit})\\s*,\\s*(?:${lit})`, 'g'))) {
    used.add(unescape(m[1] ?? m[2]));
    used.add(unescape(m[3] ?? m[4]));
  }
}
// Texte, die über Variablen laufen (Tabs, Kontinente, Sortierung, Reisemodi, Darstellung)
for (const x of ['Karte', 'Länder', 'Profil', 'Europa', 'Asien', 'Afrika', 'Nordamerika', 'Südamerika', 'Ozeanien', 'Antarktis', 'A–Z', 'Kontinent', 'Datum', 'Auto', 'Bus', 'Schiff', 'Zug', 'Andere', 'System', 'Hell', 'Dunkel'])
  used.add(x);

// Bestehende Übersetzungen einlesen (Objekt-Literal auswerten)
const src = readFileSync('src/lib/strings.ts', 'utf8');
const body = src.slice(src.indexOf('= {') + 2, src.lastIndexOf('}') + 1);
const all = new Function(`return ${body};`)();
const extra = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : {};
Object.assign(all, extra);

const keep = Object.keys(all).filter((k) => used.has(k));
const missing = [...used].filter((k) => !all[k]);
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const out = `// Übersetzungen: Deutsch -> [Englisch, Französisch, Spanisch]
// Automatisch aufgeräumt mit scripts/prune-strings.mjs, prüfen mit scripts/check-i18n.mjs
export const STRINGS: Record<string, [string, string, string]> = {
${keep.map((k) => `  ${q(k)}: [${all[k].map(q).join(', ')}],`).join('\n')}
};
`;
writeFileSync('src/lib/strings.ts', out);
console.log(`behalten: ${keep.length}, entfernt: ${Object.keys(all).length - keep.length}, fehlend: ${missing.length}`);
if (missing.length) console.log(missing.join('\n'));
