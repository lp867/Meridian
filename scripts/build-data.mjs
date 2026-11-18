// Baut die Geodaten der App aus offenen Quellen.
// Aufruf: node scripts/build-data.mjs <airports.json> <cities15000.txt> <names.json>
//   airports.json   – github.com/mwgg/Airports
//   cities15000.txt – download.geonames.org/export/dump/cities15000.zip
//   names.json      – Ausgabe von scripts/extract-names.mjs (Städtenamen DE/EN/FR/ES)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const [airportsPath, citiesPath, namesPath] = process.argv.slice(2);
if (!airportsPath || !citiesPath || !namesPath) {
  console.error('Aufruf: node scripts/build-data.mjs <airports.json> <cities15000.txt> <names.json>');
  process.exit(1);
}
const OUT = new URL('../public/data/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const write = (name, data) => {
  const json = JSON.stringify(data);
  writeFileSync(new URL(name, OUT), json);
  console.log(`${name}: ${(json.length / 1024).toFixed(0)} KB`);
};

// ---------- Länder ----------
const wc = require('world-countries');
const byCca3 = new Map(wc.map((c) => [c.cca3, c]));
const byCcn3 = new Map(wc.filter((c) => c.ccn3).map((c) => [c.ccn3, c]));
const EXTRA_COUNTABLE = new Set(['VA', 'PS', 'XK', 'TW']); // + 193 UNO-Mitglieder = 197

function continentOf(c) {
  if (c.region === 'Europe') return 'EU';
  if (c.region === 'Asia') return 'AS';
  if (c.region === 'Africa') return 'AF';
  if (c.region === 'Oceania') return 'OC';
  if (c.region === 'Antarctic') return 'AN';
  if (c.subregion === 'South America') return 'SA';
  return 'NA'; // Nord-, Mittelamerika, Karibik
}

// Namen in den App-Sprachen: [de, en, fr, es]
const countries = wc
  .map((c) => ({
    c: c.cca2,
    n: [c.translations?.deu?.common, c.name.common, c.translations?.fra?.common, c.translations?.spa?.common].map((x) => x ?? c.name.common),
    ct: continentOf(c),
    k: c.unMember || EXTRA_COUNTABLE.has(c.cca2) ? 1 : 0,
    b: (c.borders ?? []).map((x) => byCca3.get(x)?.cca2).filter(Boolean),
  }))
  .sort((a, b) => a.c.localeCompare(b.c));
write('countries.json', countries);
console.log(`  zählende Länder: ${countries.filter((c) => c.k).length}`);

// ---------- Weltkarte ----------
// 1:50m (enthält auch Liechtenstein, Monaco & Co.), vereinfacht für schnelles Zeichnen
const topo = presimplify(structuredClone(require('world-atlas/countries-50m.json')));
const simplified = simplify(topo, quantile(topo, Number(process.env.SIMPLIFY ?? 0.45)));
const fc = feature(simplified, simplified.objects.countries);
const NAME_FIX = { Somaliland: 'SO', Kosovo: 'XK', 'N. Cyprus': 'CY', 'Indian Ocean Ter.': 'CX' };
const features = fc.features
  .map((f) => {
    const cc = f.id ? byCcn3.get(f.id)?.cca2 : NAME_FIX[f.properties.name];
    return { f, cc: cc ?? null };
  })
  .filter(({ cc }) => cc !== 'AQ');

const W = 1000;
const projection = geoNaturalEarth1().fitWidth(W, { type: 'FeatureCollection', features: features.map((x) => x.f) });
const path = geoPath(projection).digits(1);
const [[, y0], [, y1]] = path.bounds({ type: 'FeatureCollection', features: features.map((x) => x.f) });
const H = Math.ceil(y1 + Math.min(0, y0));

const merged = new Map();
for (const { f, cc } of features) {
  const key = cc ?? `_${f.properties.name}`;
  const d = path(f);
  if (!d) continue;
  const m = merged.get(key) ?? { c: cc, d: '', area: 0, feats: [] };
  m.d += d;
  m.area += path.area(f);
  m.feats.push(f);
  merged.set(key, m);
}
const mapCountries = [...merged.values()].map((m) => {
  // Mittelpunkt und Ausschnitt des grössten Teilstücks (sonst zoomt Frankreich wegen Übersee nach Südamerika)
  const polys = m.feats.flatMap((f) =>
    f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })) : [f.geometry],
  );
  const main = polys.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
  const [cx, cy] = path.centroid(main);
  let [[bx0, by0], [bx1, by1]] = path.bounds(main);
  if (bx1 - bx0 > 400) {
    // über die Datumsgrenze geteilt (z. B. Russland): nur die grössere Seite verwenden
    const pts = main.coordinates.flat().map((c) => projection(c)).filter(Boolean);
    const left = pts.filter((p) => p[0] < W / 2);
    const right = pts.filter((p) => p[0] >= W / 2);
    const side = left.length > right.length ? left : right;
    bx0 = Math.min(...side.map((p) => p[0]));
    bx1 = Math.max(...side.map((p) => p[0]));
    by0 = Math.min(...side.map((p) => p[1]));
    by1 = Math.max(...side.map((p) => p[1]));
  }
  return {
    c: m.c,
    d: m.d,
    p: [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10],
    bb: [Math.floor(bx0), Math.floor(by0), Math.ceil(bx1), Math.ceil(by1)],
    s: m.area < 4 ? 1 : 0, // Kleinstaat: zusätzlich als Punkt zeichnen
  };
});
// Zählende Länder ohne Fläche in den Kartendaten (z. B. Tuvalu) als Punkt ergänzen
for (const c of wc) {
  if (c.cca2 === 'AQ' || mapCountries.some((m) => m.c === c.cca2) || !c.latlng) continue;
  if (!(c.unMember || EXTRA_COUNTABLE.has(c.cca2))) continue;
  const [x, y] = projection([c.latlng[1], c.latlng[0]]);
  mapCountries.push({ c: c.cca2, d: '', p: [Math.round(x * 10) / 10, Math.round(y * 10) / 10], bb: [x - 2, y - 2, x + 2, y + 2].map(Math.round), s: 1 });
}
write('world.json', {
  w: W,
  h: H,
  scale: projection.scale(),
  translate: projection.translate(),
  countries: mapCountries,
});
const missingOnMap = countries.filter((c) => !mapCountries.some((m) => m.c === c.c) && c.k).map((c) => c.c);
console.log(`  zählende Länder ohne Kartenfläche: ${missingOnMap.join(', ') || '–'}`);

// ---------- Städte ----------
// Zeile: [id, name, land, lat, lon, einwohner, hauptstadt, [de, en, fr, es] | 0]
const LANGS = ['de', 'en', 'fr', 'es'];
const names = JSON.parse(readFileSync(namesPath, 'utf8'));
const SKIP_CODES = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH']);
const cities = [];
for (const line of readFileSync(citiesPath, 'utf8').split('\n')) {
  if (!line) continue;
  const c = line.split('\t');
  const code = c[7];
  if (SKIP_CODES.has(code)) continue;
  const pop = Number(c[14]) || 0;
  const capital = code === 'PPLC' ? 1 : 0;
  if (pop < 15000 && !capital) continue;
  const name = c[1];
  const tr = names[c[0]] ?? {};
  const local = LANGS.map((l) => (tr[l] && tr[l] !== name ? tr[l] : ''));
  cities.push([
    Number(c[0]),
    name,
    c[8],
    Math.round(Number(c[4]) * 1000) / 1000,
    Math.round(Number(c[5]) * 1000) / 1000,
    pop,
    capital,
    local.some(Boolean) ? local : 0,
  ]);
}
cities.sort((a, b) => b[5] - a[5]);
write('cities.json', cities);

// ---------- Flughäfen ----------
const airportsRaw = JSON.parse(readFileSync(airportsPath, 'utf8'));
const grid = new Map();
const cell = (lat, lon) => `${Math.floor(lat)}:${Math.floor(lon)}`;
for (const c of cities) {
  const k = cell(c[3], c[4]);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(c);
}
const toRad = (d) => (d * Math.PI) / 180;
const distKm = (a, b, c, d) => {
  const x = Math.sin(toRad(c - a) / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(toRad(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

// Die Stadt, die ein Flughafen bedient: grosse nahe Städte gewinnen gegen den Vorort,
// in dem der Flughafen liegt (IST -> Istanbul statt Arnavutköy, ZRH -> Zürich statt Kloten).
function cityFor(a) {
  const wanted = (a.city ?? '').split(/[\/,-]/).map(norm).filter(Boolean);
  let best = null;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      for (const c of grid.get(cell(a.lat + dy, a.lon + dx)) ?? []) {
        const km = distKm(a.lat, a.lon, c[3], c[4]);
        if (km > 80) continue;
        const all = [c[1], ...(c[7] || [])].filter(Boolean).map(norm);
        const match = wanted.some((w) => all.some((n) => n === w));
        const score = (c[5] / (1 + km / 15)) * (match ? 2 : 1);
        if (!best || score > best.score) best = { id: c[0], score };
      }
  return best?.id ?? 0;
}

const AIRPORT_CITY_FIX = { BSL: ['Basel', 'CH'] };
const airports = {};
for (const a of Object.values(airportsRaw)) {
  if (!a.iata || !/^[A-Z]{3}$/.test(a.iata) || !a.tz) continue;
  if (airports[a.iata]) continue;
  airports[a.iata] = [a.name.replace(/\s+/g, ' ').trim(), a.city ?? '', a.country, Math.round(a.lat * 1000) / 1000, Math.round(a.lon * 1000) / 1000, a.tz, cityFor(a)];
  const fix = AIRPORT_CITY_FIX[a.iata];
  if (fix) airports[a.iata][6] = cities.find((c) => c[1] === fix[0] && c[2] === fix[1])?.[0] ?? 0;
}
write('airports.json', airports);
const cityById = new Map(cities.map((c) => [c[0], c]));
for (const code of ['ZRH', 'BSL', 'GVA', 'IST', 'LHR', 'JFK', 'MXP', 'CDG', 'BER', 'FRA', 'AMS', 'MAD', 'BCN', 'LIS', 'SAW', 'NRT', 'HND']) {
  const a = airports[code];
  console.log(`  ${code} -> ${a ? cityById.get(a[6])?.[1] ?? '–' : 'fehlt'}`);
}
