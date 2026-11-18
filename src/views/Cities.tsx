import { useMemo, useState } from 'preact/hooks';
import { updateData, useData } from '../lib/store';
import { cityName, citySuggestions, useDerived } from '../lib/derive';
import { cityRowName, cityRowNames, countryName, type CityRow } from '../lib/geo';
import { flag, fmtDate, fmtInt, fmtPop, fmtRange, normalize } from '../lib/format';
import { getLang, t, tn } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Empty, Row, SearchField, SectionTitle, stagger } from '../ui/kit';
import { SheetHeader, closeSheet, confirmSheet, openSheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { useCities } from './shared';
import { NoteCard } from './Countries';
import type { City, CityVisit } from '../lib/types';

function addCity(row: CityRow, visit: CityVisit) {
  updateData((d) => {
    const existing = d.cities.find((c) => c.id === row[0]);
    if (existing) {
      return { ...d, cities: d.cities.map((c) => (c.id === row[0] ? { ...c, visits: [...c.visits, visit] } : c)) };
    }
    const city: City = {
      id: row[0],
      name: row[1],
      names: cityRowNames(row),
      cc: row[2],
      lat: row[3],
      lon: row[4],
      pop: row[5],
      capital: !!row[6],
      visits: visit.date || visit.tripId ? [visit] : [],
      addedAt: Date.now(),
    };
    return { ...d, cities: [...d.cities, city], dismissedSuggestions: d.dismissedSuggestions.filter((x) => x !== row[0]) };
  });
}

/** Stadt hinzufügen oder (bei erneutem Tippen) wieder entfernen. */
export function toggleCity(row: CityRow, have: boolean) {
  if (have) {
    updateData((d) => ({ ...d, cities: d.cities.filter((c) => c.id !== row[0]) }));
    toast(t('{c} entfernt', { c: cityRowName(row) }));
  } else {
    addCity(row, {});
    toast(t('{c} hinzugefügt', { c: cityRowName(row) }));
  }
}

/** Trefferzeile: ein Tipp fügt hinzu, das Häkchen zeigt, was schon dabei ist. */
export function CityResult({ r, have }: { r: CityRow; have: boolean }) {
  const shown = cityRowName(r);
  return (
    <button class={`row press press-row city-result ${have ? 'have' : ''}`} onClick={() => toggleCity(r, have)}>
      <div class="lead flag">{flag(r[2])}</div>
      <div class="main">
        <div class="t">{shown}</div>
        <div class="s">{[countryName(r[2]), fmtPop(r[5]), r[6] ? t('Hauptstadt') : ''].filter(Boolean).join(' · ')}</div>
      </div>
      <span class={`add-toggle ${have ? 'on' : ''}`} aria-label={have ? t('Entfernen') : t('Hinzufügen')}>
        <Icon name={have ? 'check' : 'plus'} stroke={2.6} />
      </span>
    </button>
  );
}

/** Suchfeld direkt in der Städteliste: tippen, antippen, fertig. */
function QuickAdd() {
  const data = useData();
  const idx = useCities();
  const [q, setQ] = useState('');
  const threshold = data.settings.cityThreshold;
  const results = useMemo(() => {
    if (!idx || !q.trim()) return [];
    const all = idx.search(q, 0);
    return [...all.filter((r) => r[5] >= threshold || r[6]), ...all.filter((r) => r[5] < threshold && !r[6])].slice(0, 12);
  }, [idx, q, threshold]);
  const have = new Set(data.cities.map((c) => c.id));
  return (
    <>
      <label class="quick-add">
        <Icon name="plus" stroke={2.4} />
        <input
          value={q}
          placeholder={t('Stadt hinzufügen …')}
          enterKeyHint="search"
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
        />
        {q && (
          <button class="clear" onClick={() => setQ('')} aria-label={t('Leeren')}>
            <Icon name="x" stroke={2.6} />
          </button>
        )}
      </label>
      {q.trim() && (
        <div class="list compact qa-results">
          {!idx && <p class="hint">{t('Städte werden geladen …')}</p>}
          {results.map((r) => (
            <CityResult key={r[0]} r={r} have={have.has(r[0])} />
          ))}
          {idx && !results.length && <p class="hint">{t('Halte auf der Karte den Finger auf den Ort gedrückt, um ihn selbst hinzuzufügen.')}</p>}
        </div>
      )}
    </>
  );
}

export function CitiesPanel({ q = '' }: { q?: string }) {
  const data = useData();
  const d = useDerived();
  const idx = useCities();

  const suggestions = useMemo(() => {
    if (!idx) return [];
    return citySuggestions(data, d)
      .map((s) => ({ s, row: idx.byId.get(s.cityId) }))
      .filter((x): x is { s: (typeof x)['s']; row: CityRow } => !!x.row && (x.row[5] >= data.settings.cityThreshold || !!x.row[6]));
  }, [idx, data, d]);

  const groups = useMemo(() => {
    const n = normalize(q);
    const by = new Map<string, City[]>();
    for (const c of data.cities) {
      if (n && !normalize(`${cityName(c)} ${c.name} ${countryName(c.cc)}`).includes(n)) continue;
      by.set(c.cc, [...(by.get(c.cc) ?? []), c]);
    }
    const lang = getLang();
    return [...by.entries()]
      .map(([cc, list]) => ({ cc, name: countryName(cc), list: list.sort((a, b) => cityName(a).localeCompare(cityName(b), lang)) }))
      .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name, lang));
  }, [data.cities, q, d]);

  const capitals = data.cities.filter((c) => c.capital).length;
  const countries = new Set(data.cities.map((c) => c.cc)).size;

  return (
    <>
      {!q && <QuickAdd />}

      {!q && suggestions.length > 0 && (
        <>
          <div class="group-head">
            <span>{t('Vorschläge aus deinen Flügen')}</span>
          </div>
          <div class="chips suggest-chips">
            {suggestions.slice(0, 12).map(({ s, row }) => (
              <span class="chip suggest" key={row[0]}>
                <button
                  class="suggest-add press"
                  onClick={() => {
                    addCity(row, { date: s.date, tripId: s.tripId });
                    toast(t('{c} hinzugefügt', { c: cityRowName(row) }));
                  }}
                >
                  <Icon name="plus" size={14} stroke={2.6} /> {flag(row[2])} {cityRowName(row)}
                </button>
                <button
                  class="suggest-x"
                  aria-label={t('Ignorieren')}
                  onClick={() => updateData((dd) => ({ ...dd, dismissedSuggestions: [...dd.dismissedSuggestions, row[0]] }))}
                >
                  <Icon name="x" size={13} stroke={2.6} />
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      {!q && data.cities.length > 0 && (
        <p class="hint city-summary">
          {tn(data.cities.length, 'Stadt', 'Städte')} · {tn(countries, 'Land', 'Länder')} · {tn(capitals, 'Hauptstadt', 'Hauptstädte')}
        </p>
      )}

      {!data.cities.length && !suggestions.length && !q && (
        <Empty
          icon="building"
          title={t('Noch keine Städte')}
          text={t('Tippe oben eine Stadt ein und wähle sie aus. Es zählen Städte ab {n} Einwohnern und alle Hauptstädte.', { n: fmtInt(data.settings.cityThreshold) })}
        />
      )}
      {q && !groups.length && <Empty icon="search" title={t('Nichts gefunden')} text={t('Keine deiner Städte passt zu «{q}».', { q })} />}

      {groups.map((g) => (
        <div key={g.cc}>
          <div class="group-head">
            <span>
              {flag(g.cc)} {g.name}
            </span>
            <span class="num">{g.list.length}</span>
          </div>
          <div class="list compact">
            {g.list.map((c) => {
              const dates = c.visits.map((v) => v.date).filter(Boolean) as string[];
              return (
                <Row
                  lead={<Icon name={c.capital ? 'star' : c.pop ? 'building' : 'pin'} />}
                  title={cityName(c)}
                  sub={[c.pop ? fmtPop(c.pop) : t('Eigener Ort'), dates.length ? fmtDate(dates.sort().at(-1)) : ''].filter(Boolean).join(' · ')}
                  trail={c.visits.length > 1 ? <span class="badge">{c.visits.length}×</span> : undefined}
                  chevron
                  onClick={() => openCity(c.id)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ---------- Stadt hinzufügen ----------
export function openCityAdd(cc?: string) {
  openSheet(() => <CityAddSheet cc={cc} />, { tall: true });
}

function CityAddSheet({ cc }: { cc?: string }) {
  const data = useData();
  const idx = useCities();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<CityRow | null>(null);
  const threshold = data.settings.cityThreshold;
  // Grosse Städte zuerst; kleinere (ab 15'000) lassen sich bei einer Suche trotzdem hinzufügen
  const { big, small } = useMemo(() => {
    if (!idx) return { big: [] as CityRow[], small: [] as CityRow[] };
    if (!q.trim()) return { big: idx.search('', threshold, cc), small: [] };
    const all = idx.search(q, 0, cc);
    return { big: all.filter((r) => r[5] >= threshold || r[6]), small: all.filter((r) => r[5] < threshold && !r[6]).slice(0, 20) };
  }, [idx, q, threshold, cc]);
  const have = new Set(data.cities.map((c) => c.id));

  if (picked) return <VisitStep row={picked} onBack={() => setPicked(null)} />;

  const row = (r: CityRow) => <CityResult key={r[0]} r={r} have={have.has(r[0])} />;

  return (
    <>
      <SheetHeader title={cc ? t('Stadt in {c}', { c: countryName(cc) }) : t('Stadt hinzufügen')} />
      <div style={{ padding: '4px 0 6px' }}>
        <SearchField value={q} onInput={setQ} placeholder={t('Stadt suchen, z. B. Lissabon')} autoFocus />
      </div>
      <div class="sheet-body">
        {!idx && <p class="hint">{t('Städte werden geladen …')}</p>}
        {idx && !big.length && !small.length && <Empty icon="search" title={t('Keine Stadt gefunden')} text={t('Halte auf der Karte den Finger auf den Ort gedrückt, um ihn selbst hinzuzufügen.')} />}
        {big.length > 0 && (
          <div class="list plain stagger" key={q}>
            {big.map(row)}
          </div>
        )}
        {small.length > 0 && (
          <>
            <SectionTitle>{t('Kleinere Städte (unter {n} Einwohnern)', { n: fmtInt(threshold) })}</SectionTitle>
            <div class="list plain stagger" key={`s${q}`}>
              {small.map(row)}
            </div>
          </>
        )}
        <p class="hint" style={{ marginTop: '14px' }}>
          {t('Ganz kleiner Ort? Halte auf der Karte den Finger darauf gedrückt (am PC: Rechtsklick).')}
        </p>
      </div>
    </>
  );
}

/** Langes Drücken auf die Karte: Stadt in der Nähe wählen oder eigenen Ort anlegen. */
export function openAddPlace(lon: number, lat: number, cc: string | null) {
  if (!cc) {
    toast(t('An dieser Stelle ist kein Land'), true);
    return;
  }
  openSheet(() => <AddPlaceSheet lon={lon} lat={lat} cc={cc} />, { tall: true });
}

function AddPlaceSheet({ lon, lat, cc }: { lon: number; lat: number; cc: string }) {
  const idx = useCities();
  const data = useData();
  const [picked, setPicked] = useState<CityRow | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const have = new Set(data.cities.map((c) => c.id));
  const nearby = useMemo(() => {
    if (!idx) return [];
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dist = (r: CityRow) => {
      const x = Math.sin(toRad(r[3] - lat) / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(r[3])) * Math.sin(toRad(r[4] - lon) / 2) ** 2;
      return 12742 * Math.asin(Math.sqrt(x));
    };
    return idx.rows
      .filter((r) => Math.abs(r[3] - lat) < 0.6 && Math.abs(r[4] - lon) < 0.9)
      .map((r) => ({ r, km: dist(r) }))
      .filter((x) => x.km <= 35)
      .sort((a, b) => a.km - b.km)
      .slice(0, 6);
  }, [idx]);

  if (picked) return <VisitStep row={picked} onBack={() => setPicked(null)} />;

  const addCustom = () => {
    const n = name.trim();
    if (!n) return;
    const city: City = {
      id: -Date.now(), // eigene Orte: negative IDs
      name: n,
      cc,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      pop: 0,
      capital: false,
      visits: date ? [{ date }] : [],
      addedAt: Date.now(),
    };
    updateData((d) => ({ ...d, cities: [...d.cities, city] }));
    closeSheet();
    toast(t('{c} hinzugefügt', { c: n }));
  };

  return (
    <>
      <SheetHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>{flag(cc)}</span>
            {t('Ort hinzufügen')}
          </span>
        }
      />
      <div class="sheet-body">
        <p class="hint" style={{ margin: '0 20px 6px' }}>
          {countryName(cc)}
        </p>
        {nearby.length > 0 && (
          <>
            <SectionTitle>{t('In der Nähe')}</SectionTitle>
            <div class="list plain stagger">
              {nearby.map(({ r, km }, i) => (
                <Row
                  key={r[0]}
                  style={stagger(i)}
                  lead={<Icon name={r[6] ? 'star' : 'building'} />}
                  title={cityRowName(r)}
                  sub={`${fmtPop(r[5])} · ${fmtInt(Math.round(km))} km`}
                  trail={have.has(r[0]) ? <span class="badge ok">{t('dabei')}</span> : undefined}
                  chevron
                  onClick={() => {
                    toggleCity(r, have.has(r[0]));
                    closeSheet();
                  }}
                />
              ))}
            </div>
          </>
        )}
        <SectionTitle>{t('Eigener Ort')}</SectionTitle>
        <label class="field big">
          <span>{t('Name des Ortes')}</span>
          <input value={name} placeholder={t('z. B. Zermatt')} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} enterKeyHint="done" />
        </label>
        <label class="field">
          <span>{t('Datum des Besuchs')}</span>
          <input type="date" value={date} onInput={(e) => setDate((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <div class="sheet-actions">
          <button class="btn primary press" disabled={!name.trim()} onClick={addCustom}>
            <Icon name="pin" /> {t('Ort hinzufügen')}
          </button>
        </div>
      </div>
    </>
  );
}

function VisitStep({ row, onBack, existing }: { row: CityRow | null; onBack: () => void; existing?: City }) {
  const [date, setDate] = useState('');
  const name = row ? cityRowName(row) : cityName(existing!);
  const cc = row ? row[2] : existing!.cc;

  const save = () => {
    const visit: CityVisit = { date: date || undefined };
    if (row) addCity(row, visit);
    else if (existing)
      updateData((dd) => ({ ...dd, cities: dd.cities.map((c) => (c.id === existing.id ? { ...c, visits: [...c.visits, visit] } : c)) }));
    closeSheet();
    toast(row ? t('{c} hinzugefügt', { c: name }) : t('Besuch gespeichert'));
  };

  return (
    <>
      <SheetHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>{flag(cc)}</span>
            {name}
          </span>
        }
        action={
          row ? (
            <button class="btn small press" onClick={onBack}>
              <Icon name="chevL" /> {t('Suche')}
            </button>
          ) : undefined
        }
      />
      <div class="sheet-body swap" style={{ '--dir': '1' }}>
        <p class="hint" style={{ margin: '0 20px 16px' }}>
          {countryName(cc)} · {t('Das Datum ist freiwillig.')}
        </p>
        <label class="field">
          <span>{t('Datum des Besuchs')}</span>
          <input type="date" value={date} onInput={(e) => setDate((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <div class="sheet-actions">
          <button class="btn primary press" onClick={save}>
            <Icon name="check" stroke={2.6} /> {row ? t('Hinzufügen') : t('Besuch speichern')}
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- Stadt-Details ----------
export function openCity(id: number) {
  openSheet(() => <CitySheet id={id} />);
}

function CitySheet({ id }: { id: number }) {
  const data = useData();
  const d = useDerived();
  const [adding, setAdding] = useState(false);
  const city = data.cities.find((c) => c.id === id);
  if (!city) return <SheetHeader title={t('Stadt entfernt')} />;
  if (adding) return <VisitStep row={null} existing={city} onBack={() => setAdding(false)} />;
  const name = cityName(city);

  const remove = async () => {
    const ok = await confirmSheet({ title: t('{c} entfernen?', { c: name }), text: t('Die Stadt und ihre Besuche werden gelöscht.'), ok: t('Entfernen'), danger: true });
    if (!ok) return;
    updateData((dd) => ({ ...dd, cities: dd.cities.filter((c) => c.id !== id) }));
    setTimeout(closeSheet, 60);
  };
  const removeVisit = (i: number) =>
    updateData((dd) => ({ ...dd, cities: dd.cities.map((c) => (c.id === id ? { ...c, visits: c.visits.filter((_, j) => j !== i) } : c)) }));

  return (
    <>
      <SheetHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>{flag(city.cc)}</span>
            {name}
          </span>
        }
      />
      <div class="sheet-body">
        <p class="hint" style={{ margin: '0 20px 14px', fontSize: '14.5px', color: 'var(--text2)' }}>
          {countryName(city.cc)} · {city.pop ? tn(city.pop, 'Einwohner', 'Einwohner') : t('Eigener Ort')}
          {city.capital ? ` · ${t('Hauptstadt')}` : ''}
        </p>
        <SectionTitle action={t('Besuch hinzufügen')} onAction={() => setAdding(true)}>
          {t('Besuche')}
        </SectionTitle>
        {city.visits.length ? (
          <div class="list">
            {city.visits.map((v, i) => {
              return (
                <Row
                  lead={<Icon name="calendar" />}
                  title={v.date ? fmtDate(v.date) : t('Ohne Datum')}
                  trail={
                    <button class="icon-btn press" style={{ width: '34px', height: '34px' }} aria-label={t('Besuch löschen')} onClick={() => removeVisit(i)}>
                      <Icon name="x" size={16} stroke={2.3} />
                    </button>
                  }
                />
              );
            })}
          </div>
        ) : (
          <p class="hint" style={{ marginTop: 0 }}>
            {t('Noch kein Datum erfasst.')}
          </p>
        )}
        <SectionTitle>{t('Notiz')}</SectionTitle>
        <NoteCard
          value={city.note ?? ''}
          onSave={(note) => updateData((dd) => ({ ...dd, cities: dd.cities.map((c) => (c.id === id ? { ...c, note: note || undefined } : c)) }))}
        />
        <div class="sheet-actions" style={{ marginTop: '16px' }}>
          <button class="btn danger press" onClick={remove}>
            <Icon name="trash" /> {t('Stadt entfernen')}
          </button>
        </div>
      </div>
    </>
  );
}
