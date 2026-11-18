export interface Flight {
  id: string;
  createdAt?: string;
  dep: string; // IATA
  arr: string;
  depName?: string;
  arrName?: string;
  depTs: number; // UTC, ms
  arrTs: number;
  aircraftCode?: string;
  aircraftName?: string;
  reg?: string;
  airlineCode?: string;
  airlineName?: string;
  flightNumber?: string;
  km?: number;
  comments?: string;
  seat?: string;
  travelClass?: string;
}

export interface FvTrip {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  description?: string;
  purpose?: string;
  costAmount?: string;
  costCurrency?: string;
}

export interface AirportInfo {
  name: string;
  city: string; // Stadtname (Original)
  cityNames?: string[]; // [de, en, fr, es]
  cityId: number; // GeoNames-ID oder 0
  country: string; // ISO-2
  lat: number;
  lon: number;
  tz: string;
}

export interface CityVisit {
  date?: string; // YYYY-MM-DD
  tripId?: string;
}

export interface City {
  id: number; // GeoNames-ID
  name: string;
  names?: string[]; // [de, en, fr, es]
  cc: string;
  lat: number;
  lon: number;
  pop: number;
  capital: boolean;
  visits: CityVisit[];
  note?: string;
  addedAt: number;
}

export type TravelMode = 'car' | 'train' | 'bus' | 'boat' | 'other';

export interface ManualTrip {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string;
  mode: TravelMode;
  countries: string[];
  note?: string;
}

export interface TripOverride {
  name?: string;
  note?: string;
  extraCountries?: string[]; // auf dem Landweg durchquert
  outboundMode?: TravelMode; // Hinreise ohne Flug
  returnMode?: TravelMode; // Rückreise ohne Flug
}

export interface CountryMark {
  status?: 'visited' | 'wish';
  note?: string;
}

export interface Settings {
  cityThreshold: number;
  home: string;
  layoverHours: number;
  name?: string; // Anzeigename im Profil
}

export interface AppData {
  version: 1;
  flights: Flight[];
  fvTrips: FvTrip[];
  airports: Record<string, AirportInfo>;
  countries: Record<string, CountryMark>;
  cities: City[];
  manualTrips: ManualTrip[];
  tripOverrides: Record<string, TripOverride>;
  tripSplits: string[]; // Flug-IDs, vor denen ein neuer Trip beginnt
  tripJoins: string[]; // Flug-IDs, die mit dem vorherigen Trip verbunden werden
  dismissedSuggestions: number[];
  settings: Settings;
  updatedAt: number;
}

/** Geräteeinstellungen, die nicht ins Konto synchronisiert werden. */
export interface Meta {
  lastExportAt: number;
  onboarded: boolean;
  accountUid: string; // angemeldetes Konto (leer = ohne Konto)
  accountEmail: string;
  syncRemote: number; // Stand (updatedAt) der Cloud bei der letzten Synchronisierung
  syncLocal: number; // Stand der Gerätedaten bei der letzten Synchronisierung
  lastSyncAt: number;
  syncError: string;
  pendingAction?: { action: 'delete-account' | 'wipe-data'; email: string; at: number }; // wartet auf Bestätigung per E-Mail
  lang: 'de' | 'en' | 'fr' | 'es';
  theme: 'system' | 'dark' | 'light';
  mapCityMin?: number; // Städte-Modus der Karte: Mindestgrösse (Einwohner)
}
