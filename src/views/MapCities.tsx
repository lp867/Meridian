// Städte-Modus der Karte: alle Städte einblenden, nach Land und Grösse filtern, antippen = hinzufügen.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { updateData, updateMeta, useData } from '../lib/store';
import { cityName, useDerived } from '../lib/derive';
import { cityRowName, countriesSorted, countryName, getStatic, loadCities, project, type CityIndex, type CityRow } from '../lib/geo';
import { flag, fmtInt, fmtPop, normalize } from '../lib/format';
import { t } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { SearchField, SectionTitle } from '../ui/kit';
import { SheetHeader, closeSheet, openSheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import type { Box, CityLayer } from '../ui/WorldMap';
import type { City } from '../lib/types';
import { addCity, openCity, openCityAdd } from './Cities';
import { ChoiceSheet } from '../ui/ChoiceSheet';

// ---------- Daten ----------
/** Lädt die Städteliste erst, wenn der Modus zum ersten Mal gebraucht wird. */
export function useCityIndex(active: boolean): CityIndex | null {
  const [idx, setIdx] = useState<CityIndex | null>(null);
  useEffect(() => {
    if (!active || idx) return;
    let alive = true;
    loadCities()
      .then((c) => alive && setIdx(c))
      .catch(() => toast(t('Städte konnten nicht geladen werden.'), true));
    return () => void (alive = false);
  }, [active]);
  return idx;
}

/** Kartenposition jeder Stadt – einmal berechnet. */
let xyCache: { idx: CityIndex; xy: Float32Array } | null = null;
function rowXY(idx: CityIndex) {
  if (xyCache?.idx === idx) return xyCache.xy;
  const proj = getStatic().projection;
  const xy = new Float32Array(idx.rows.length * 2);
  idx.rows.forEach((r, i) => {
    const p = proj([r[4], r[3]]);
    xy[2 * i] = p ? p[0] : NaN;
    xy[2 * i + 1] = p ? p[1] : NaN;
  });
  xyCache = { idx, xy };
  return xy;
}

export interface CityStats {
  have: number;
  total: number;
}

/** Ebene für die Karte: besuchte zuerst, dann alle passenden Städte nach Grösse. */
export function buildCityLayer(idx: CityIndex, cities: City[], cc: string | null, minPop: number): { layer: CityLayer; stats: CityStats } {
  const xy = rowXY(idx);
  const haveIds = new Set(cities.map((c) => c.id));
  const size = idx.rows.length + cities.length;
  const x = new Float32Array(size);
  const y = new Float32Array(size);
  const id = new Float64Array(size);
  const flags = new Uint8Array(size);
  const src: (CityRow | City)[] = [];
  let n = 0;
  for (const c of cities.filter((c) => !cc || c.cc === cc).sort((a, b) => b.pop - a.pop)) {
    const [px, py] = project(c.lon, c.lat);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    x[n] = px;
    y[n] = py;
    id[n] = c.id;
    flags[n] = 1 | (c.capital ? 2 : 0);
    src[n++] = c;
  }
  let total = 0;
  let have = 0;
  for (let i = 0; i < idx.rows.length; i++) {
    const r = idx.rows[i];
    if ((cc && r[2] !== cc) || r[5] < minPop) continue;
    total++;
    if (haveIds.has(r[0])) {
      have++;
      continue;
    }
    if (Number.isNaN(xy[2 * i])) continue;
    x[n] = xy[2 * i];
    y[n] = xy[2 * i + 1];
    id[n] = r[0];
    flags[n] = r[6] ? 2 : 0;
    src[n++] = r;
  }
  const label = (i: number) => {
    const s = src[i];
    return Array.isArray(s) ? cityRowName(s) : cityName(s);
  };
  return { layer: { n, x, y, id, flags, label }, stats: { have, total } };
}

/** Ausschnitt für ein Land: die Landesfläche, ausser sie ist durch Überseegebiete riesig – dann die Städte. */
export function countryBox(idx: CityIndex, cc: string): Box | null {
  const xy = rowXY(idx);
  const xs: number[] = [];
  const ys: number[] = [];
  idx.rows.forEach((r, i) => {
    if (r[2] === cc && !Number.isNaN(xy[2 * i])) {
      xs.push(xy[2 * i]);
      ys.push(xy[2 * i + 1]);
    }
  });
  const shape = getStatic().mapByCode.get(cc)?.bb as Box | undefined;
  if (xs.length < 3) return shape ?? null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const cut = xs.length > 50 ? 0.02 : 0;
  const q = (a: number[], p: number) => a[Math.round(p * (a.length - 1))];
  const b: Box = [q(xs, cut), q(ys, cut), q(xs, 1 - cut), q(ys, 1 - cut)];
  const pw = (b[2] - b[0]) * 0.08 + 2;
  const ph = (b[3] - b[1]) * 0.08 + 2;
  const fromCities: Box = [b[0] - pw, b[1] - ph, b[2] + pw, b[3] + ph];
  if (!shape) return fromCities;
  const area = (x: Box) => Math.max(1, (x[2] - x[0]) * (x[3] - x[1]));
  return area(shape) <= area(fromCities) * 4 ? shape : fromCities;
}

// ---------- Antippen ----------
/** Unbesuchte Stadt: sofort hinzufügen (mit «Rückgängig»). Besuchte: Details öffnen. */
export function tapCity(idx: CityIndex | null, id: number, have: boolean, pulse: (id: number) => void) {
  if (have) {
    openCity(id);
    return;
  }
  const row = idx?.byId.get(id);
  if (!row) return;
  addCity(row, {});
  pulse(id);
  navigator.vibrate?.(8);
  toast(t('{c} hinzugefügt', { c: cityRowName(row) }), false, {
    label: t('Rückgängig'),
    run: () => updateData((d) => ({ ...d, cities: d.cities.filter((c) => c.id !== id) })),
  });
}

// ---------- Filter ----------
const SIZES = [0, 50000, 100000, 500000, 1000000];
export const sizeLabel = (v: number) => (v > 0 ? t('ab {n}', { n: fmtPop(v) }) : t('Alle Grössen'));

export function pickCitySize(current: number, threshold: number) {
  const values = [...new Set([...SIZES, threshold])].sort((a, b) => a - b);
  openSheet(() => (
    <ChoiceSheet
      title={t('Stadtgrösse')}
      hint={t('Kleinere Städte erscheinen, sobald du näher heranzoomst.')}
      options={values.map((v) => ({
        value: String(v),
        label: v > 0 ? t('ab {n} Einwohnern', { n: fmtInt(v) }) : t('Alle Städte (ab {n} Einwohnern)', { n: fmtInt(15000) }),
      }))}
      value={String(current)}
      onPick={(v) => updateMeta({ mapCityMin: Number(v) })}
    />
  ));
}

/** Land für den Städte-Modus wählen; null = alle Länder. */
export function pickCityCountry(idx: CityIndex, current: string | null, minPop: number, onPick: (cc: string | null) => void) {
  openSheet(() => <CountryFilterSheet idx={idx} value={current} minPop={minPop} onPick={(cc) => (onPick(cc), closeSheet())} />, { tall: true });
}

function CountryFilterSheet({ idx, value, minPop, onPick }: { idx: CityIndex; value: string | null; minPop: number; onPick: (cc: string | null) => void }) {
  const data = useData();
  const d = useDerived();
  const [q, setQ] = useState('');
  // besucht / gesamt pro Land für die gewählte Grösse
  const counts = useMemo(() => {
    const have = new Set(data.cities.map((c) => c.id));
    const m = new Map<string, [number, number]>();
    for (const r of idx.rows) {
      if (r[5] < minPop) continue;
      let e = m.get(r[2]);
      if (!e) m.set(r[2], (e = [0, 0]));
      e[1]++;
      if (have.has(r[0])) e[0]++;
    }
    return m;
  }, [idx, minPop, data.cities]);
  const { mine, rest } = useMemo(() => {
    const n = normalize(q);
    const all = countriesSorted().filter((c) => c.ct !== 'AN' && counts.has(c.c));
    const hits = n ? all.filter((c) => c.n.some((x) => normalize(x).includes(n)) || c.c.toLowerCase() === n) : all;
    const visited = (cc: string) => !!d.countries.get(cc)?.visited;
    return { mine: hits.filter((c) => visited(c.c)), rest: hits.filter((c) => !visited(c.c)) };
  }, [q, counts, d]);

  const row = (cc: string) => {
    const [a, b] = counts.get(cc) ?? [0, 0];
    return (
      <button key={cc} class="row press press-row" onClick={() => onPick(cc)}>
        <div class="lead flag">{flag(cc)}</div>
        <div class="main">
          <div class="t">{countryName(cc)}</div>
          <div class="s">{t('{a} von {b} besucht', { a: fmtInt(a), b: fmtInt(b) })}</div>
        </div>
        <span class={`check ${value === cc ? 'on' : ''}`}>
          <Icon name="check" stroke={3} />
        </span>
      </button>
    );
  };

  return (
    <>
      <SheetHeader title={t('Land wählen')} />
      <div style={{ padding: '4px 0 10px' }}>
        <SearchField value={q} onInput={setQ} placeholder={t('Land suchen')} />
      </div>
      <div class="sheet-body">
        {!q && (
          <div class="list plain">
            <button class="row press press-row" onClick={() => onPick(null)}>
              <div class="lead">
                <Icon name="globe" />
              </div>
              <div class="main">
                <div class="t">{t('Alle Länder')}</div>
              </div>
              <span class={`check ${value === null ? 'on' : ''}`}>
                <Icon name="check" stroke={3} />
              </span>
            </button>
          </div>
        )}
        {mine.length > 0 && (
          <>
            <SectionTitle>{t('Deine Länder')}</SectionTitle>
            <div class="list plain">{mine.map((c) => row(c.c))}</div>
          </>
        )}
        {rest.length > 0 && (
          <>
            <SectionTitle>{t('Weitere Länder')}</SectionTitle>
            <div class="list plain">{rest.slice(0, 260).map((c) => row(c.c))}</div>
          </>
        )}
      </div>
    </>
  );
}

// ---------- Leiste oben im Städte-Modus ----------
export function CityModePanel({
  cc,
  minPop,
  stats,
  loading,
  onCountry,
  onSize,
  onDone,
}: {
  cc: string | null;
  minPop: number;
  stats: CityStats | null;
  loading: boolean;
  onCountry: () => void;
  onSize: () => void;
  onDone: () => void;
}) {
  return (
    <div class="city-panel mat">
      <div class="cp-head">
        <div class="cp-title">
          <b>{t('Städte wählen')}</b>
          <span class="num">
            {loading || !stats ? t('Städte werden geladen …') : t('{a} von {b} besucht', { a: fmtInt(stats.have), b: fmtInt(stats.total) })}
          </span>
        </div>
        <button class="icon-btn press cp-search" onClick={() => openCityAdd(cc ?? undefined)} aria-label={t('Stadt suchen')}>
          <Icon name="search" />
        </button>
        <button class="btn small primary press" onClick={onDone}>
          {t('Fertig')}
        </button>
      </div>
      <div class="cp-filters">
        <button class={`chip press ${cc ? 'on' : ''}`} onClick={onCountry} disabled={loading}>
          {cc ? <span class="cp-flag">{flag(cc)}</span> : <Icon name="globe" size={15} />}
          <span class="cp-chip-t">{cc ? countryName(cc) : t('Alle Länder')}</span>
          <Icon name="chevD" size={14} />
        </button>
        <button class={`chip press ${minPop > 0 ? 'on' : ''}`} onClick={onSize}>
          <Icon name="building" size={15} />
          <span class="cp-chip-t">{sizeLabel(minPop)}</span>
          <Icon name="chevD" size={14} />
        </button>
      </div>
      <p class="cp-hint">
        <i class="cp-dot" /> {t('Antippen zum Hinzufügen')}
        <i class="cp-dot on" /> {t('Besucht')}
      </p>
    </div>
  );
}
