// Prüft eingelesene Sicherungen (Datei oder GitHub) Feld für Feld.
// Unbekannte oder kaputte Einträge werden verworfen, damit eine manipulierte
// Datei die App weder zum Absturz bringt noch fremde Felder einschleust.
import { emptyData } from './store';
import type { AppData, City, CityVisit, CountryMark, Flight, FvTrip, ManualTrip, TravelMode, TripOverride, AirportInfo } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 100000) : []);
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const CC = /^[A-Z]{2}$/;
const IATA = /^[A-Z0-9]{3,4}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MODES: TravelMode[] = ['car', 'train', 'bus', 'boat', 'other'];

function validTz(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const names4 = (v: unknown) => (Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'string') ? (v as string[]).map((x) => x.slice(0, 200)) : undefined);
const countries = (v: unknown) => arr(v).filter((c): c is string => typeof c === 'string' && CC.test(c)).slice(0, 300);

export function cleanFlight(f: unknown): Flight | null {
  if (!isObj(f)) return null;
  const id = str(f.id, 200);
  const dep = str(f.dep, 4);
  const arrv = str(f.arr, 4);
  const depTs = num(f.depTs);
  const arrTs = num(f.arrTs);
  if (!id || !dep || !arrv || !IATA.test(dep) || !IATA.test(arrv) || depTs == null || arrTs == null) return null;
  return {
    id,
    dep,
    arr: arrv,
    depTs,
    arrTs,
    createdAt: str(f.createdAt, 40),
    depName: str(f.depName, 200),
    arrName: str(f.arrName, 200),
    aircraftCode: str(f.aircraftCode, 20),
    aircraftName: str(f.aircraftName, 120),
    reg: str(f.reg, 20),
    airlineCode: str(f.airlineCode, 10),
    airlineName: str(f.airlineName, 120),
    flightNumber: str(f.flightNumber, 20),
    km: num(f.km),
    comments: str(f.comments, 5000),
    seat: str(f.seat, 20),
    travelClass: str(f.travelClass, 40),
  };
}

export function cleanFvTrip(t: unknown): FvTrip | null {
  if (!isObj(t)) return null;
  const id = str(t.id, 200);
  const name = str(t.name, 200);
  const startDate = str(t.startDate, 10);
  const endDate = str(t.endDate, 10);
  if (!id || !name || !startDate || !YMD.test(startDate) || !endDate || !YMD.test(endDate)) return null;
  return {
    id,
    name,
    startDate,
    endDate,
    description: str(t.description, 5000),
    purpose: str(t.purpose, 60),
    costAmount: str(t.costAmount, 30),
    costCurrency: str(t.costCurrency, 10),
  };
}

function airport(a: unknown): AirportInfo | null {
  if (!isObj(a)) return null;
  const country = str(a.country, 2);
  const tz = str(a.tz, 60);
  const lat = num(a.lat);
  const lon = num(a.lon);
  if (!country || !CC.test(country) || !tz || !validTz(tz) || lat == null || lon == null) return null;
  return { name: str(a.name, 200) ?? '', city: str(a.city, 200) ?? '', cityNames: names4(a.cityNames), cityId: num(a.cityId) ?? 0, country, lat, lon, tz };
}

function city(c: unknown): City | null {
  if (!isObj(c)) return null;
  const id = num(c.id);
  const name = str(c.name, 200);
  const cc = str(c.cc, 2);
  const lat = num(c.lat);
  const lon = num(c.lon);
  if (id == null || !name || !cc || !CC.test(cc) || lat == null || lon == null) return null;
  const visits = arr(c.visits)
    .filter(isObj)
    .map((v): CityVisit => {
      const date = str(v.date, 10);
      return { date: date && YMD.test(date) ? date : undefined, tripId: str(v.tripId, 220) };
    })
    .slice(0, 500);
  return { id, name, names: names4(c.names), cc, lat, lon, pop: num(c.pop) ?? 0, capital: c.capital === true, visits, note: str(c.note, 5000), addedAt: num(c.addedAt) ?? 0 };
}

function manualTrip(m: unknown): ManualTrip | null {
  if (!isObj(m)) return null;
  const id = str(m.id, 100);
  const start = str(m.start, 10);
  const end = str(m.end, 10);
  if (!id || !start || !YMD.test(start)) return null;
  return {
    id,
    name: str(m.name, 200) ?? '',
    start,
    end: end && YMD.test(end) ? end : start,
    mode: MODES.includes(m.mode as TravelMode) ? (m.mode as TravelMode) : 'other',
    countries: countries(m.countries),
    note: str(m.note, 5000),
  };
}

function override(o: unknown): TripOverride | null {
  if (!isObj(o)) return null;
  const mode = (v: unknown) => (MODES.includes(v as TravelMode) ? (v as TravelMode) : undefined);
  return {
    name: str(o.name, 200),
    note: str(o.note, 5000),
    extraCountries: o.extraCountries ? countries(o.extraCountries) : undefined,
    outboundMode: mode(o.outboundMode),
    returnMode: mode(o.returnMode),
  };
}

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = num(v);
  return n == null ? fallback : Math.min(max, Math.max(min, n));
};

/** Baut aus beliebigem JSON ein sauberes AppData-Objekt. */
export function sanitizeData(raw: unknown): AppData {
  const base = emptyData();
  if (!isObj(raw)) throw new Error('invalid');
  const keep = <T>(list: unknown, fn: (x: unknown) => T | null) => arr(list).map(fn).filter((x): x is T => x !== null);

  const airports: Record<string, AirportInfo> = {};
  if (isObj(raw.airports))
    for (const [k, v] of Object.entries(raw.airports)) {
      const a = IATA.test(k) ? airport(v) : null;
      if (a) airports[k] = a;
    }
  const marks: Record<string, CountryMark> = {};
  if (isObj(raw.countries))
    for (const [k, v] of Object.entries(raw.countries)) {
      if (!CC.test(k) || !isObj(v)) continue;
      const status = v.status === 'visited' || v.status === 'wish' ? v.status : undefined;
      const note = str(v.note, 5000);
      if (status || note) marks[k] = { status, note };
    }
  const overrides: Record<string, TripOverride> = {};
  if (isObj(raw.tripOverrides))
    for (const [k, v] of Object.entries(raw.tripOverrides)) {
      const o = /^[fm]:[^\s]{1,200}$/.test(k) ? override(v) : null;
      if (o) overrides[k] = o;
    }
  const s = isObj(raw.settings) ? raw.settings : {};
  const home = str(s.home, 2);

  return {
    version: 1,
    flights: keep(raw.flights, cleanFlight),
    fvTrips: keep(raw.fvTrips, cleanFvTrip),
    airports,
    countries: marks,
    cities: keep(raw.cities, city),
    manualTrips: keep(raw.manualTrips, manualTrip),
    tripOverrides: overrides,
    tripSplits: arr(raw.tripSplits).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 200)),
    tripJoins: arr(raw.tripJoins).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 200)),
    dismissedSuggestions: arr(raw.dismissedSuggestions).filter((x): x is number => typeof x === 'number' && Number.isFinite(x)),
    settings: {
      cityThreshold: clamp(s.cityThreshold, 1000, 10_000_000, base.settings.cityThreshold),
      home: home && CC.test(home) ? home : base.settings.home,
      layoverHours: clamp(s.layoverHours, 1, 168, base.settings.layoverHours),
      name: str(s.name, 60),
    },
    updatedAt: num(raw.updatedAt) ?? Date.now(),
  };
}
