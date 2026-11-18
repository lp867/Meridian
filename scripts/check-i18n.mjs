// Prüft, ob alle t()/tn()/tw()-Texte in src/ eine Übersetzung in src/lib/strings.ts haben.
// Aufruf: node scripts/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

const used = new Set();
const lit = `'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"`;
const reT = new RegExp(`\\bt\\(\\s*(?:${lit})`, 'g');
const reN = new RegExp(`\\bt[nw]\\(\\s*[^,]+,\\s*(?:${lit})\\s*,\\s*(?:${lit})`, 'g');
const reTr = new RegExp(`\\btr\\(\\s*(?:${lit})`, 'g');
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(reT)) used.add(m[1] ?? m[2]);
  for (const m of s.matchAll(reTr)) used.add(m[1] ?? m[2]);
  for (const m of s.matchAll(reN)) {
    used.add(m[1] ?? m[2]);
    used.add(m[3] ?? m[4]);
  }
}
// Texte, die über Variablen laufen
for (const extra of ['Karte', 'Länder', 'Profil', 'Europa', 'Asien', 'Afrika', 'Nordamerika', 'Südamerika', 'Ozeanien', 'Antarktis', 'A–Z', 'Kontinent', 'Datum', 'Auto', 'Bus', 'Schiff', 'Zug', 'Andere', 'System', 'Hell', 'Dunkel'])
  used.add(extra);

const strings = readFileSync('src/lib/strings.ts', 'utf8');
const keys = new Set(
  [...strings.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([\p{L}_$][\p{L}\p{N}_$]*)):\s*\[/gmu)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'")),
);
const missing = [...used].map((u) => u.replace(/\\'/g, "'")).filter((u) => !keys.has(u));
const unused = [...keys].filter((k) => ![...used].map((u) => u.replace(/\\'/g, "'")).includes(k));
console.log(`verwendet: ${used.size}, übersetzt: ${keys.size}`);
if (missing.length) console.log('FEHLT:\n' + missing.map((m) => `  ${JSON.stringify(m)}`).join('\n'));
if (unused.length) console.log('unbenutzt: ' + unused.length);
process.exit(missing.length ? 1 : 0);
