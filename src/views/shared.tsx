import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../ui/Icon';
import { SearchField, stagger } from '../ui/kit';
import { SheetHeader, closeSheet, openSheet } from '../ui/Sheet';
import { countriesSorted, countryName, loadCities, type CityIndex } from '../lib/geo';
import { flag, normalize } from '../lib/format';
import { useMeta, useData } from '../lib/store';
import { getAccount } from '../lib/cloud';
import { t } from '../lib/i18n';

export function useCities(): CityIndex | null {
  const [idx, setIdx] = useState<CityIndex | null>(null);
  useEffect(() => {
    let alive = true;
    loadCities().then((c) => alive && setIdx(c));
    return () => void (alive = false);
  }, []);
  return idx;
}

/** Hinweis-Punkt am Profil-Tab, wenn es noch keine Sicherung gibt. */
export function useBackupWarning() {
  const meta = useMeta();
  const data = useData();
  const hasData = data.flights.length + data.cities.length + Object.keys(data.countries).length + data.manualTrips.length > 0;
  if (!hasData) return false;
  if (getAccount().status === 'signedIn') return !!meta.syncError;
  return Date.now() - meta.lastExportAt > 14 * 86400000;
}

/** Länder auswählen (z. B. auf dem Landweg durchquert). */
export function pickCountries(initial: string[], title: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    let result: string[] | null = null;
    openSheet(() => <CountryPicker initial={initial} title={title} onDone={(v) => ((result = v), closeSheet())} />, {
      tall: true,
      onClose: () => resolve(result),
    });
  });
}

function CountryPicker({ initial, title, onDone }: { initial: string[]; title: string; onDone: (v: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(initial);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = normalize(q);
    const all = countriesSorted().filter((c) => c.ct !== 'AN');
    const hits = n ? all.filter((c) => c.n.some((x) => normalize(x).includes(n)) || c.c.toLowerCase() === n) : all;
    return [...hits.filter((c) => sel.includes(c.c)), ...hits.filter((c) => !sel.includes(c.c))];
  }, [q]);
  const toggle = (c: string) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  return (
    <>
      <SheetHeader
        title={title}
        action={
          <button class="btn primary small press" onClick={() => onDone(sel)}>
            {t('Fertig')}
            {sel.length ? ` (${sel.length})` : ''}
          </button>
        }
      />
      <div style={{ padding: '4px 0 10px' }}>
        <SearchField value={q} onInput={setQ} placeholder={t('Land suchen')} />
      </div>
      <div class="sheet-body">
        <div class="list plain stagger">
          {list.slice(0, 260).map((c, i) => (
            <button class="row press press-row" style={i < 16 ? stagger(i) : undefined} onClick={() => toggle(c.c)}>
              <div class="lead flag">{flag(c.c)}</div>
              <div class="main">
                <div class="t">{countryName(c.c)}</div>
              </div>
              <span class={`check ${sel.includes(c.c) ? 'on' : ''}`}>
                <Icon name="check" stroke={3} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export const countryFlags = (codes: string[], max = 7) =>
  codes.length > max ? `${codes.slice(0, max).map(flag).join('')} +${codes.length - max}` : codes.map(flag).join('');
