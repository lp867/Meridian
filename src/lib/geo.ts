import { geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { normalize } from './format';
import { getLang, pick, t } from './i18n';

const base = import.meta.env.BASE_URL;
const fetchJson = async <T>(name: string): Promise<T> => {
  const r = await fetch(`${base}data/${name}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
};

// ---------- Länder ----------
export type Continent = 'EU' | 'AS' | 'AF' | 'NA' | 'SA' | 'OC' | 'AN';
const CONTINENT_NAMES: Record<Continent, string> = {
  EU: 'Europa',
  AS: 'Asien',
  AF: 'Afrika',
  NA: 'Nordamerika',
  SA: 'Südamerika',
  OC: 'Ozeanien',
  AN: 'Antarktis',
};
export const CONTINENTS: { code: Continent }[] = (['EU', 'AS', 'AF', 'NA', 'SA', 'OC'] as Continent[]).map((code) => ({ code }));
export const continentName = (c: string) => t(CONTINENT_NAMES[c as Continent] ?? 'Antarktis');

export interface CountryMeta {
  c: string; // ISO-2
  n: string[]; // Namen [de, en, fr, es]
  ct: Continent;
  k: 0 | 1; // zählt als Land (UNO + Kosovo, Taiwan, Palästina, Vatikan)
  b: string[]; // Nachbarländer
}

export interface MapCountry {
  c: string | null;
  d: string;
  p: [number, number];
  bb: [number, number, number, number];
  s: 0 | 1;
}

export interface WorldData {
  w: number;
  h: number;
  scale: number;
  translate: [number, number];
  countries: MapCountry[];
}

export interface StaticData {
  world: WorldData;
  countries: CountryMeta[];
  byCode: Map<string, CountryMeta>;
  mapByCode: Map<string, MapCountry>;
  projection: GeoProjection;
  countableTotal: number;
  countableByContinent: Record<string, number>;
}

let staticData: StaticData | null = null;
export const getStatic = () => staticData!;

export async function loadStatic(): Promise<StaticData> {
  if (staticData) return staticData;
  const [world, countries] = await Promise.all([fetchJson<WorldData>('world.json'), fetchJson<CountryMeta[]>('countries.json')]);
  const projection = geoNaturalEarth1().scale(world.scale).translate(world.translate);
  const countableByContinent: Record<string, number> = {};
  for (const c of countries) if (c.k) countableByContinent[c.ct] = (countableByContinent[c.ct] ?? 0) + 1;
  staticData = {
    world,
    countries,
    byCode: new Map(countries.map((c) => [c.c, c])),
    mapByCode: new Map(world.countries.filter((m) => m.c).map((m) => [m.c!, m])),
    projection,
    countableTotal: countries.filter((c) => c.k).length,
    countableByContinent,
  };
  return staticData;
}

/** Ländername in der aktuellen Sprache. */
export const countryName = (cc: string) => {
  const m = staticData?.byCode.get(cc);
  return m ? pick(m.n, m.n[1]) : cc;
};

/** Länder alphabetisch in der aktuellen Sprache. */
let sortedCache: { lang: string; list: CountryMeta[] } | null = null;
export function countriesSorted(): CountryMeta[] {
  const lang = getLang();
  if (sortedCache?.lang === lang) return sortedCache.list;
  const list = [...staticData!.countries].sort((a, b) => countryName(a.c).localeCompare(countryName(b.c), lang));
  sortedCache = { lang, list };
  return list;
}

export const project = (lon: number, lat: number): [number, number] => staticData!.projection([lon, lat]) ?? [0, 0];

export function arcPath(a: [number, number], b: [number, number]) {
  return geoPath(staticData!.projection)({ type: 'LineString', coordinates: [a, b] }) ?? '';
}

// ---------- Flughäfen ----------
// [name, city, country, lat, lon, tz, cityId]
type AirportRow = [string, string, string, number, number, string, number];
let airportsPromise: Promise<Record<string, AirportRow>> | null = null;
export const loadAirports = () => (airportsPromise ??= fetchJson('airports.json'));

// ---------- Städte ----------
// [id, name, cc, lat, lon, pop, capital, [de, en, fr, es] | 0]
export type CityRow = [number, string, string, number, number, number, 0 | 1, string[] | 0];
export const cityRowName = (r: CityRow) => pick(r[7], r[1]);
/** Alle Namen [de, en, fr, es] einer Stadt (leere Einträge = Originalname). */
export const cityRowNames = (r: CityRow) => [0, 1, 2, 3].map((i) => (r[7] && r[7][i]) || r[1]);

export interface CityIndex {
  rows: CityRow[];
  byId: Map<number, CityRow>;
  search: (q: string, threshold: number, cc?: string) => CityRow[];
}
let citiesPromise: Promise<CityIndex> | null = null;
export function loadCities(): Promise<CityIndex> {
  return (citiesPromise ??= fetchJson<CityRow[]>('cities.json').then((rows) => {
    const keys = rows.map((r) => `|${[r[1], ...(r[7] || [])].filter(Boolean).map(normalize).join('|')}`);
    const byId = new Map(rows.map((r) => [r[0], r]));
    return {
      rows,
      byId,
      search(q, threshold, cc) {
        const n = normalize(q);
        const out: { r: CityRow; score: number }[] = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (cc && r[2] !== cc) continue;
          if (r[5] < threshold && !r[6]) continue;
          if (!n) {
            out.push({ r, score: 0 });
            if (out.length >= 60) break;
            continue;
          }
          const k = keys[i];
          const at = k.indexOf(n);
          if (at < 0) continue;
          const prev = k[at - 1];
          const score = prev === '|' ? 3 : prev === ' ' || prev === '-' ? 2 : 1;
          out.push({ r, score: score * 1e9 + r[5] });
        }
        return out
          .sort((a, b) => b.score - a.score)
          .slice(0, 40)
          .map((x) => x.r);
      },
    };
  }));
}
