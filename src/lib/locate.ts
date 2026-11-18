// Standort des Geräts (nur auf Knopfdruck, der Browser fragt vorher um Erlaubnis).
import { t } from './i18n';
import type { CityIndex, CityRow } from './geo';

export interface Position {
  lat: number;
  lon: number;
  acc: number; // Genauigkeit in Metern
}

export function locate(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error(t('Dieses Gerät kann den Standort nicht bestimmen.')));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? t('Standort nicht erlaubt. Du kannst ihn in den Einstellungen des Browsers freigeben.')
              : t('Der Standort konnte nicht bestimmt werden. Versuche es draussen oder mit eingeschaltetem GPS nochmals.'),
          ),
        ),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 5 * 60000 },
    );
  });
}

const rad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const x = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/** Städte im Umkreis, nächste zuerst. */
export function nearbyCities(idx: CityIndex, lat: number, lon: number, maxKm = 35, limit = 6): { r: CityRow; km: number }[] {
  const dLat = maxKm / 111;
  const dLon = maxKm / (111 * Math.max(0.15, Math.cos(rad(lat))));
  const out: { r: CityRow; km: number }[] = [];
  for (const r of idx.rows) {
    if (Math.abs(r[3] - lat) > dLat || Math.abs(r[4] - lon) > dLon) continue;
    const km = distanceKm(lat, lon, r[3], r[4]);
    if (km <= maxKm) out.push({ r, km });
  }
  return out.sort((a, b) => a.km - b.km).slice(0, limit);
}
