import Papa from 'papaparse';
import type { AirportInfo, AppData, Flight, FvTrip } from './types';
import { cityRowNames, loadAirports, loadCities } from './geo';
import { updateData, dataStore } from './store';
import { t } from './i18n';
import { sanitizeData } from './sanitize';

/** Ältere Daten: fehlende mehrsprachige Stadtnamen der Flughäfen nachtragen. */
export async function migrateAirports() {
  const d = dataStore.get();
  if (!d.flights.length || Object.values(d.airports).every((a) => a.cityNames || !a.cityId)) return;
  const stripped = Object.fromEntries(Object.entries(d.airports).filter(([, a]) => a.cityNames));
  const { airports } = await resolveAirports({ ...d, airports: stripped });
  updateData((dd) => ({ ...dd, airports }));
}

export interface ImportReport {
  flightsNew: number;
  flightsUpdated: number;
  tripsNew: number;
  tripsUpdated: number;
  unknownAirports: string[];
  skipped: string[];
}

/** FlightVault exportiert UTC; ohne Zeitzonenangabe wird UTC angenommen. */
export function parseTs(v: string | undefined): number {
  if (!v) return NaN;
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? n * 1000 : n;
  }
  let iso = s.replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  return Date.parse(iso);
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const ymd = (v: string | undefined) => {
  if (!v) return '';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = parseTs(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

function parseCsv(text: string) {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  return { rows: res.data, fields: res.meta.fields ?? [] };
}

function toFlight(r: Record<string, string>): Flight | null {
  const id = str(r.id);
  const dep = str(r.departureAirportCode)?.toUpperCase();
  const arr = str(r.arrivalAirportCode)?.toUpperCase();
  const depTs = parseTs(r.departureTs);
  const arrTs = parseTs(r.arrivalTs);
  if (!id || !dep || !arr || !Number.isFinite(depTs)) return null;
  const km = Number(str(r.lengthInKm)?.replace(',', '.'));
  return {
    id,
    createdAt: str(r.createdAt),
    dep,
    arr,
    depName: str(r.departureAirportName),
    arrName: str(r.arrivalAirportName),
    depTs,
    arrTs: Number.isFinite(arrTs) ? arrTs : depTs,
    aircraftCode: str(r.aircraftCode),
    aircraftName: str(r.aircraftName),
    reg: str(r.aircraftRegistration)?.toUpperCase(),
    airlineCode: str(r.airlineCode),
    airlineName: str(r.airlineName),
    flightNumber: str(r.flightNumber),
    km: Number.isFinite(km) && km > 0 ? km : undefined,
    comments: str(r.comments),
    seat: str(r.seat),
    travelClass: str(r.travelClass),
  };
}

function toTrip(r: Record<string, string>): FvTrip | null {
  const id = str(r.id);
  const name = str(r.name);
  const startDate = ymd(str(r.startDate));
  if (!id || !name || !startDate) return null;
  return {
    id,
    name,
    startDate,
    endDate: ymd(str(r.endDate)) || startDate,
    description: str(r.description),
    purpose: str(r.purpose),
    costAmount: str(r.costAmount),
    costCurrency: str(r.costCurrency),
  };
}

/** Ergänzt Flughafen-Infos (Land, Zeitzone, Stadt) für alle verwendeten IATA-Codes. */
export async function resolveAirports(data: AppData): Promise<{ airports: Record<string, AirportInfo>; unknown: string[] }> {
  const [table, cities] = await Promise.all([loadAirports(), loadCities()]);
  const airports = { ...data.airports };
  const unknown: string[] = [];
  const codes = new Set(data.flights.flatMap((f) => [f.dep, f.arr]));
  for (const code of codes) {
    if (airports[code]?.cityNames || (airports[code] && !airports[code].cityId)) continue;
    const a = table[code];
    if (!a) {
      unknown.push(code);
      continue;
    }
    const city = a[6] ? cities.byId.get(a[6]) : undefined;
    airports[code] = {
      name: a[0],
      city: city?.[1] ?? a[1],
      cityNames: city ? cityRowNames(city) : undefined,
      cityId: city?.[0] ?? 0,
      country: a[2],
      lat: a[3],
      lon: a[4],
      tz: a[5],
    };
  }
  return { airports, unknown };
}

export async function importFlightVault(files: File[]): Promise<ImportReport> {
  const report: ImportReport = { flightsNew: 0, flightsUpdated: 0, tripsNew: 0, tripsUpdated: 0, unknownAirports: [], skipped: [] };
  const data = dataStore.get();
  const flights = new Map(data.flights.map((f) => [f.id, f]));
  const trips = new Map(data.fvTrips.map((t) => [t.id, t]));

  for (const file of files) {
    const { rows, fields } = parseCsv(await file.text());
    if (fields.includes('departureAirportCode')) {
      for (const r of rows) {
        const f = toFlight(r);
        if (!f) continue;
        if (flights.has(f.id)) report.flightsUpdated++;
        else report.flightsNew++;
        flights.set(f.id, f);
      }
    } else if (fields.includes('startDate') && fields.includes('name')) {
      for (const r of rows) {
        const t = toTrip(r);
        if (!t) continue;
        if (trips.has(t.id)) report.tripsUpdated++;
        else report.tripsNew++;
        trips.set(t.id, t);
      }
    } else {
      report.skipped.push(file.name);
    }
  }

  const next: AppData = {
    ...data,
    flights: [...flights.values()].sort((a, b) => a.depTs - b.depTs),
    fvTrips: [...trips.values()].sort((a, b) => a.startDate.localeCompare(b.startDate)),
  };
  const { airports, unknown } = await resolveAirports(next);
  report.unknownAirports = unknown;
  updateData(() => ({ ...next, airports }));
  return report;
}

// ---------- Backup-Dateien ----------
export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const backupJson = (d: AppData) => JSON.stringify({ app: 'meridian', exportedAt: new Date().toISOString(), data: d }, null, 1);

export function parseBackup(text: string): AppData {
  if (text.length > 50 * 1024 * 1024) throw new Error(t('Keine gültige Meridian-Sicherung'));
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(t('Keine gültige Meridian-Sicherung'));
  }
  const o = j as { app?: string; data?: unknown; version?: number; flights?: unknown };
  const d = o?.app === 'meridian' ? (o.data as typeof o) : o;
  if (!d || d.version !== 1 || !Array.isArray(d.flights)) throw new Error(t('Keine gültige Meridian-Sicherung'));
  // Jedes Feld prüfen, statt der Datei blind zu vertrauen
  return sanitizeData(d);
}

const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
