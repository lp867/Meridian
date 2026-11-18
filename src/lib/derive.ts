// Regeln aus KONZEPT.md: Touchdown zählt, Trips aus Flügen, Tagesausflüge, Umstiege, Bodenstrecken.
import { useData } from './store';
import { daysBetween, localDate } from './format';
import { getStatic } from './geo';
import { getLang, pick, t } from './i18n';
import type { AirportInfo } from './types';

/** Stadtname eines Flughafens in der aktuellen Sprache. */
export const airportCity = (a: AirportInfo | undefined, code = '') => (a ? pick(a.cityNames, a.city) || code : code);
/** Stadtname einer erfassten Stadt in der aktuellen Sprache. */
export const cityName = (c: City) => pick(c.names, c.name);
import type { AppData, City, Flight, ManualTrip, TravelMode } from './types';

export type StopRole = 'start' | 'dest' | 'layover' | 'end';
export type TripItem =
  | { kind: 'airport'; iata: string; role: StopRole; arrTs?: number; depTs?: number }
  | { kind: 'flight'; flight: Flight }
  | { kind: 'ground'; from: string; to: string };

export interface Trip {
  id: string;
  kind: 'flight' | 'manual';
  name: string;
  autoName: string;
  start: string;
  end: string;
  nights: number;
  dayTrip: boolean;
  domestic: boolean;
  flights: Flight[];
  items: TripItem[];
  countries: string[];
  km: number;
  minutes: number;
  rawNoOutbound: boolean;
  rawNoReturn: boolean;
  noOutbound: boolean;
  noReturn: boolean;
  mode?: TravelMode;
  note?: string;
  fvTripId?: string;
  manual?: ManualTrip;
  destinations: string[];
  cities: City[];
}

export interface CountryStat {
  code: string;
  visited: boolean;
  derived: boolean;
  manual: boolean;
  wish: boolean;
  home: boolean;
  first?: string;
  last?: string;
  trips: Trip[];
  layoverOnly: boolean;
  cities: City[];
}

export type Issue =
  | { type: 'noClass'; flight: Flight }
  | { type: 'flightNo'; flight: Flight }
  | { type: 'times'; flight: Flight; why: string }
  | { type: 'airport'; code: string };

export interface Counted {
  name: string;
  count: number;
  sub?: string;
}

export interface FlightStats {
  count: number;
  km: number;
  minutes: number;
  airports: number;
  years: { year: number; count: number; km: number; minutes: number }[];
  topRoutes: Counted[];
  topAirlines: Counted[];
  topAircraft: Counted[];
  topAirports: Counted[];
  classes: Counted[];
  regs: { reg: string; count: number; type: string; airline: string; last: number }[];
  longest?: Flight;
  shortest?: Flight;
}

export interface Derived {
  trips: Trip[];
  tripById: Map<string, Trip>;
  tripOfFlight: Map<string, Trip>;
  countries: Map<string, CountryStat>;
  visitedCount: number;
  territoryCount: number;
  wishCount: number;
  byContinent: Record<string, number>;
  issues: Issue[];
  stats: FlightStats;
  flightKm: (f: Flight) => number;
}

const toRad = (d: number) => (d * Math.PI) / 180;
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const x =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

export function displayFlightNo(f: Flight) {
  const n = f.flightNumber ?? '';
  if (/^\d+$/.test(n) && f.airlineCode) return `${f.airlineCode}${n}`;
  return n || '—';
}

const MAX_GAP = 45 * 86400000;

function buildFlightTrips(data: AppData): Trip[] {
  const home = data.settings.home;
  const ap = (c: string) => data.airports[c];
  const cc = (c: string) => ap(c)?.country;
  const tz = (c: string) => ap(c)?.tz ?? 'UTC';
  const flights = [...data.flights].sort((a, b) => a.depTs - b.depTs);
  const splits = new Set(data.tripSplits);
  const joins = new Set(data.tripJoins);
  const layoverMs = data.settings.layoverHours * 3600000;

  const groups: Flight[][] = [];
  let cur: Flight[] | null = null;
  for (const f of flights) {
    if (cur) {
      const prev = cur[cur.length - 1];
      if (splits.has(f.id) || (f.depTs - prev.arrTs > MAX_GAP && !joins.has(f.id))) {
        groups.push(cur);
        cur = null;
      }
    }
    if (!cur) {
      if (joins.has(f.id) && !splits.has(f.id) && groups.length) {
        cur = groups.pop()!;
        cur.push(f);
      } else cur = [f];
    } else cur.push(f);
    if (cc(f.arr) === home) {
      groups.push(cur);
      cur = null;
    }
  }
  if (cur) groups.push(cur);

  return groups.map((g) => {
    const first = g[0];
    const last = g[g.length - 1];
    const id = `f:${first.id}`;
    const ov = data.tripOverrides[id] ?? {};
    const start = localDate(first.depTs, tz(first.dep));
    const end = localDate(last.arrTs, tz(last.arr));
    const rawNoOutbound = cc(first.dep) !== home;
    const rawNoReturn = cc(last.arr) !== home;

    const items: TripItem[] = [{ kind: 'airport', iata: first.dep, role: rawNoOutbound ? 'dest' : 'start', depTs: first.depTs }];
    g.forEach((f, i) => {
      items.push({ kind: 'flight', flight: f });
      const next = g[i + 1];
      if (!next) {
        items.push({ kind: 'airport', iata: f.arr, role: rawNoReturn ? 'dest' : 'end', arrTs: f.arrTs });
      } else if (next.dep === f.arr) {
        const role = next.depTs - f.arrTs < layoverMs ? 'layover' : 'dest';
        items.push({ kind: 'airport', iata: f.arr, role, arrTs: f.arrTs, depTs: next.depTs });
      } else {
        items.push({ kind: 'airport', iata: f.arr, role: 'dest', arrTs: f.arrTs });
        items.push({ kind: 'ground', from: f.arr, to: next.dep });
        items.push({ kind: 'airport', iata: next.dep, role: 'dest', depTs: next.depTs });
      }
    });

    const countries: string[] = [];
    for (const it of items)
      if (it.kind === 'airport') {
        const c = cc(it.iata);
        if (c && c !== home && !countries.includes(c)) countries.push(c);
      }
    for (const c of ov.extraCountries ?? []) if (c !== home && !countries.includes(c)) countries.push(c);

    const destinations: string[] = [];
    for (const it of items)
      if (it.kind === 'airport' && it.role === 'dest') {
        const name = airportCity(ap(it.iata), it.iata);
        if (!destinations.includes(name)) destinations.push(name);
      }

    const km = g.reduce((s, f) => s + flightKmOf(data, f), 0);
    const minutes = g.reduce((s, f) => s + Math.max(0, (f.arrTs - f.depTs) / 60000), 0);
    const domestic = items.every((it) => it.kind !== 'airport' || cc(it.iata) === home);
    let autoName = destinations.length > 3 ? `${destinations.slice(0, 2).join(' · ')} +${destinations.length - 2}` : destinations.join(' · ');
    if (!autoName) autoName = domestic ? t('Inlandflug') : t('Trip');

    // FlightVault-Trip über den Datumsbereich zuordnen (Regel 7)
    let fvTripId: string | undefined;
    let best = -1;
    for (const t of data.fvTrips) {
      const overlap = daysBetween(start > t.startDate ? start : t.startDate, end < t.endDate ? end : t.endDate);
      if (overlap >= 0 && overlap > best) {
        best = overlap;
        fvTripId = t.id;
      }
    }
    const fvName = fvTripId ? data.fvTrips.find((t) => t.id === fvTripId)?.name : undefined;

    return {
      id,
      kind: 'flight',
      name: ov.name || fvName || autoName,
      autoName,
      start,
      end,
      nights: Math.max(0, daysBetween(start, end)),
      dayTrip: !rawNoOutbound && !rawNoReturn && start === end,
      domestic,
      flights: g,
      items,
      countries,
      km,
      minutes,
      rawNoOutbound,
      rawNoReturn,
      noOutbound: rawNoOutbound && !ov.outboundMode,
      noReturn: rawNoReturn && !ov.returnMode,
      note: ov.note,
      fvTripId,
      destinations,
      cities: [],
    } satisfies Trip;
  });
}

function flightKmOf(data: AppData, f: Flight) {
  if (f.km) return f.km;
  const a = data.airports[f.dep];
  const b = data.airports[f.arr];
  return a && b ? haversineKm(a, b) : 0;
}

function manualTrip(m: ManualTrip, home: string): Trip {
  const end = m.end && m.end >= m.start ? m.end : m.start;
  return {
    id: `m:${m.id}`,
    kind: 'manual',
    name: m.name || t('Reise'),
    autoName: m.name,
    start: m.start,
    end,
    nights: Math.max(0, daysBetween(m.start, end)),
    dayTrip: m.start === end,
    domestic: m.countries.every((c) => c === home),
    flights: [],
    items: [],
    countries: m.countries.filter((c) => c !== home),
    km: 0,
    minutes: 0,
    rawNoOutbound: false,
    rawNoReturn: false,
    noOutbound: false,
    noReturn: false,
    mode: m.mode,
    note: m.note,
    manual: m,
    destinations: [],
    cities: [],
  };
}

function top(map: Map<string, Counted>, n = 8) {
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}
function bump(map: Map<string, Counted>, key: string | undefined, sub?: string) {
  if (!key) return;
  const c = map.get(key) ?? { name: key, count: 0, sub };
  c.count++;
  map.set(key, c);
}

function flightStats(data: AppData): FlightStats {
  const years = new Map<number, { year: number; count: number; km: number; minutes: number }>();
  const routes = new Map<string, Counted>();
  const airlines = new Map<string, Counted>();
  const aircraft = new Map<string, Counted>();
  const airports = new Map<string, Counted>();
  const classes = new Map<string, Counted>();
  const regs = new Map<string, FlightStats['regs'][number]>();
  let km = 0;
  let minutes = 0;
  let longest: Flight | undefined;
  let shortest: Flight | undefined;
  for (const f of data.flights) {
    const fk = flightKmOf(data, f);
    const fm = Math.max(0, (f.arrTs - f.depTs) / 60000);
    km += fk;
    minutes += fm;
    const y = new Date(f.depTs).getUTCFullYear();
    const yr = years.get(y) ?? { year: y, count: 0, km: 0, minutes: 0 };
    yr.count++;
    yr.km += fk;
    yr.minutes += fm;
    years.set(y, yr);
    bump(routes, [f.dep, f.arr].sort().join(' – '));
    bump(airlines, f.airlineName ?? f.airlineCode);
    bump(aircraft, f.aircraftName ?? f.aircraftCode);
    bump(airports, f.dep);
    bump(airports, f.arr);
    bump(classes, f.travelClass ?? t('ohne Angabe'));
    if (f.reg) {
      const r = regs.get(f.reg) ?? { reg: f.reg, count: 0, type: f.aircraftName ?? f.aircraftCode ?? '', airline: f.airlineName ?? '', last: 0 };
      r.count++;
      r.last = Math.max(r.last, f.depTs);
      regs.set(f.reg, r);
    }
    if (fk > 0 && (!longest || fk > flightKmOf(data, longest))) longest = f;
    if (fk > 0 && (!shortest || fk < flightKmOf(data, shortest))) shortest = f;
  }
  return {
    count: data.flights.length,
    km,
    minutes,
    airports: airports.size,
    years: [...years.values()].sort((a, b) => a.year - b.year),
    topRoutes: top(routes),
    topAirlines: top(airlines),
    topAircraft: top(aircraft),
    topAirports: top(airports),
    classes: top(classes, 10),
    regs: [...regs.values()].sort((a, b) => b.count - a.count || b.last - a.last),
    longest,
    shortest,
  };
}

const cache = new WeakMap<AppData, Map<string, Derived>>();

export function derive(data: AppData): Derived {
  const hit = cache.get(data)?.get(getLang());
  if (hit) return hit;
  const st = getStatic();
  const home = data.settings.home;

  const trips = [...buildFlightTrips(data), ...data.manualTrips.map((m) => manualTrip(m, home))].sort(
    (a, b) => b.start.localeCompare(a.start) || b.end.localeCompare(a.end),
  );
  const tripById = new Map(trips.map((t) => [t.id, t]));
  const tripOfFlight = new Map<string, Trip>();
  for (const t of trips) for (const f of t.flights) tripOfFlight.set(f.id, t);

  // Städte den Trips zuordnen: explizit, sonst über das Datum
  const tripForVisit = (date?: string, tripId?: string) =>
    (tripId && tripById.get(tripId)) || (date ? trips.find((t) => t.start <= date && date <= t.end) : undefined);
  for (const c of data.cities)
    for (const v of c.visits) {
      const t = tripForVisit(v.date, v.tripId);
      if (t && !t.cities.includes(c)) t.cities.push(c);
    }

  // Länder
  const countries = new Map<string, CountryStat>();
  const stat = (code: string) => {
    let s = countries.get(code);
    if (!s) {
      s = { code, visited: false, derived: false, manual: false, wish: false, home: code === home, trips: [], layoverOnly: true, cities: [] };
      countries.set(code, s);
    }
    return s;
  };
  const touch = (code: string | undefined, date: string | undefined, trip?: Trip, layover = false) => {
    if (!code) return;
    const s = stat(code);
    s.derived = true;
    if (!layover) s.layoverOnly = false;
    if (date) {
      if (!s.first || date < s.first) s.first = date;
      if (!s.last || date > s.last) s.last = date;
    }
    if (trip && !s.trips.includes(trip)) s.trips.push(trip);
  };

  for (const t of trips) {
    if (t.kind === 'flight') {
      for (const it of t.items) {
        if (it.kind !== 'airport') continue;
        const a = data.airports[it.iata];
        if (!a) continue;
        const ts = it.arrTs ?? it.depTs ?? 0;
        touch(a.country, localDate(ts, a.tz), a.country === home ? undefined : t, it.role === 'layover');
      }
      for (const c of data.tripOverrides[t.id]?.extraCountries ?? []) touch(c, t.start, t);
    } else {
      for (const c of t.manual!.countries) touch(c, t.start, c === home ? undefined : t);
    }
  }
  for (const c of data.cities) {
    const s = stat(c.cc);
    s.cities.push(c);
    s.derived = true;
    s.layoverOnly = false;
    for (const v of c.visits) touch(c.cc, v.date);
  }
  stat(home).derived = true;
  stat(home).layoverOnly = false;
  for (const [code, mark] of Object.entries(data.countries)) {
    if (!mark.status) continue;
    const s = stat(code);
    if (mark.status === 'visited') s.manual = true;
    if (mark.status === 'wish') s.wish = true;
  }

  let visitedCount = 0;
  let territoryCount = 0;
  let wishCount = 0;
  const byContinent: Record<string, number> = {};
  for (const s of countries.values()) {
    s.visited = s.derived || s.manual;
    if (s.visited) s.wish = false;
    if (s.wish) wishCount++;
    s.trips.sort((a, b) => b.start.localeCompare(a.start));
    if (!s.visited) continue;
    const meta = st.byCode.get(s.code);
    if (meta?.k) {
      visitedCount++;
      byContinent[meta.ct] = (byContinent[meta.ct] ?? 0) + 1;
    } else territoryCount++;
  }

  // Datencheck
  const issues: Issue[] = [];
  const unknown = new Set<string>();
  for (const f of data.flights) {
    if (!data.airports[f.dep]) unknown.add(f.dep);
    if (!data.airports[f.arr]) unknown.add(f.arr);
    if (!f.travelClass) issues.push({ type: 'noClass', flight: f });
    if (f.flightNumber && /^\d+$/.test(f.flightNumber)) issues.push({ type: 'flightNo', flight: f });
    const min = (f.arrTs - f.depTs) / 60000;
    const km = flightKmOf(data, f);
    if (min <= 0) issues.push({ type: 'times', flight: f, why: t('Ankunft vor Abflug') });
    else if (km > 0 && km / (min / 60) > 1150) issues.push({ type: 'times', flight: f, why: t('zu kurze Flugzeit') });
    else if (km > 0 && min > 60 && km / (min / 60) < 120) issues.push({ type: 'times', flight: f, why: t('zu lange Flugzeit') });
  }
  for (const code of unknown) issues.push({ type: 'airport', code });
  for (const t of trips) {
  }

  const result: Derived = {
    trips,
    tripById,
    tripOfFlight,
    countries,
    visitedCount,
    territoryCount,
    wishCount,
    byContinent,
    issues,
    stats: flightStats(data),
    flightKm: (f) => flightKmOf(data, f),
  };
  if (!cache.has(data)) cache.set(data, new Map());
  cache.get(data)!.set(getLang(), result);
  return result;
}

export const useDerived = () => derive(useData());

/** Städte-Vorschläge aus Flügen: Ziel-Flughäfen -> Stadt (Bestätigung von Hand). */
export interface CitySuggestion {
  cityId: number;
  airport: string;
  date: string;
  tripId: string;
}
export function citySuggestions(data: AppData, d: Derived): CitySuggestion[] {
  const have = new Set(data.cities.map((c) => c.id));
  const dismissed = new Set(data.dismissedSuggestions);
  const out = new Map<number, CitySuggestion>();
  for (const t of [...d.trips].reverse()) {
    for (const it of t.items) {
      if (it.kind !== 'airport' || it.role === 'layover') continue;
      const a = data.airports[it.iata];
      if (!a?.cityId || have.has(a.cityId) || dismissed.has(a.cityId) || out.has(a.cityId)) continue;
      out.set(a.cityId, { cityId: a.cityId, airport: it.iata, date: localDate(it.arrTs ?? it.depTs ?? 0, a.tz), tripId: t.id });
    }
  }
  return [...out.values()];
}
