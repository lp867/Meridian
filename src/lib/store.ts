import { createStore as idbStore, get as idbGet, set as idbSet } from 'idb-keyval';

// Eigene Datenbank: Auf github.io teilen sich alle Pages-Projekte eines Kontos dieselbe Herkunft.
const db = idbStore('meridian', 'kv');
const get = <T>(key: string) => idbGet<T>(key, db);
const set = (key: string, value: unknown) => idbSet(key, value, db);
import { useEffect, useState } from 'preact/hooks';
import type { AppData, Meta } from './types';
import { guessLang } from './i18n';

/** Heimatland-Vorschlag aus der Spracheinstellung des Geräts (z. B. de-CH -> CH). */
export function guessHome(): string {
  for (const l of navigator.languages ?? [navigator.language]) {
    const m = l.match(/-([A-Z]{2})\b/i);
    if (m) return m[1].toUpperCase();
  }
  return 'CH';
}

export const emptyData = (): AppData => ({
  version: 1,
  flights: [],
  fvTrips: [],
  airports: {},
  countries: {},
  cities: [],
  manualTrips: [],
  tripOverrides: {},
  tripSplits: [],
  tripJoins: [],
  dismissedSuggestions: [],
  settings: { cityThreshold: 50000, home: guessHome(), layoverHours: 24 },
  updatedAt: 0,
});

const emptyMeta = (): Meta => ({
  lastExportAt: 0,
  onboarded: false,
  lang: guessLang(),
  theme: 'dark',
  accountUid: '',
  accountEmail: '',
  syncRemote: 0,
  syncLocal: 0,
  lastSyncAt: 0,
  syncError: '',
});

/** Kleiner Store mit Abonnenten – reicht für eine App dieser Grösse. */
function createStore<T>(initial: T) {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      subs.forEach((s) => s(value));
    },
    subscribe(fn: (v: T) => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
}

export const dataStore = createStore<AppData>(emptyData());
export const metaStore = createStore<Meta>(emptyMeta());

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  const [v, setV] = useState(store.get());
  useEffect(() => {
    setV(store.get());
    return store.subscribe(setV);
  }, [store]);
  return v;
}

export const useData = () => useStore(dataStore);
export const useMeta = () => useStore(metaStore);

// ---------- Speichern ----------
let saveTimer = 0;
const changeListeners = new Set<() => void>();
export const onDataChange = (fn: () => void) => {
  changeListeners.add(fn);
  return () => void changeListeners.delete(fn);
};

export function updateData(fn: (d: AppData) => AppData) {
  const next = { ...fn(dataStore.get()), updatedAt: Date.now() };
  dataStore.set(next);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void set('data', next), 250);
  changeListeners.forEach((l) => l());
}

export function replaceData(next: AppData) {
  const merged = { ...emptyData(), ...next, settings: { ...emptyData().settings, ...next.settings } };
  updateData(() => merged);
}

/** Übernimmt Daten aus der Cloud, ohne erneut eine Synchronisierung auszulösen. */
export function setDataFromSync(next: AppData) {
  const merged = { ...emptyData(), ...next, settings: { ...emptyData().settings, ...next.settings } };
  dataStore.set(merged);
  clearTimeout(saveTimer);
  void set('data', merged);
}

export function updateMeta(patch: Partial<Meta>) {
  const next = { ...metaStore.get(), ...patch };
  metaStore.set(next);
  void set('meta', next);
}

export async function loadStores() {
  let [d, m] = await Promise.all([get<AppData>('data'), get<Meta>('meta')]);
  if (!d && !m) [d, m] = await migrateLegacyStore();
  if (d) dataStore.set({ ...emptyData(), ...d, settings: { ...emptyData().settings, ...d.settings } });
  if (m) {
    // Überbleibsel der früheren GitHub-Sicherung (inkl. Token) entfernen
    const { githubToken, githubRepo, githubPath, autoBackup, lastBackupAt, lastBackupError, backedUpVersion, ...rest } = m as Meta & Record<string, unknown>;
    const cleaned = { ...emptyMeta(), ...rest } as Meta;
    metaStore.set(cleaned);
    if (githubToken !== undefined) void set('meta', cleaned);
    void [githubRepo, githubPath, autoBackup, lastBackupAt, lastBackupError, backedUpVersion];
  }
}

/** Bittet den Browser, die Daten nicht bei Speicherknappheit zu löschen. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Frühe Testversionen speicherten in der Standard-Datenbank von idb-keyval. */
async function migrateLegacyStore(): Promise<[AppData | undefined, Meta | undefined]> {
  try {
    // Nur nachsehen, wenn die alte Datenbank existiert (sonst würde sie leer angelegt)
    const dbs = (await indexedDB.databases?.()) ?? [];
    if (!dbs.some((x) => x.name === 'keyval-store')) return [undefined, undefined];
    const [d, m] = await Promise.all([idbGet<AppData>('data'), idbGet<Meta>('meta')]);
    const looksLikeOurs = d && d.version === 1 && Array.isArray(d.flights) && Array.isArray(d.cities);
    if (!looksLikeOurs) return [undefined, undefined];
    await Promise.all([set('data', d), m ? set('meta', m) : Promise.resolve()]);
    return [d, m];
  } catch {
    return [undefined, undefined];
  }
}
