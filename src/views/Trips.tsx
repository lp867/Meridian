import { useMemo, useState } from 'preact/hooks';
import { uid, updateData, useData } from '../lib/store';
import { airportCity, cityName, displayFlightNo, useDerived, type Trip, type TripItem } from '../lib/derive';
import { arcPath, countryName, getStatic, project } from '../lib/geo';
import { flag, fmtDate, fmtDuration, fmtInt, fmtRange, localTime, todayYmd } from '../lib/format';
import { t, tn, tw } from '../lib/i18n';
import { Icon, modeIcon, modeName } from '../ui/Icon';
import { Chip, Empty, LargeTitle, NavBar, Row, SectionTitle, stagger } from '../ui/kit';
import { SheetHeader, closeSheet, confirmSheet, openSheet } from '../ui/Sheet';
import { useNav } from '../ui/Stack';
import { MiniMap, boxOfPoints, type MapArc, type MapDot } from '../ui/WorldMap';
import { toast } from '../ui/Toast';
import { goBack } from '../lib/backstack';
import { CountryDetail, NoteCard } from './Countries';
import { openCity, openCityAdd } from './Cities';
import { FlightDetail, openImport } from './Flights';
import { countryFlags, pickCountries } from './shared';
import type { ManualTrip, TravelMode, TripOverride } from '../lib/types';

type Filter = 'all' | 'overnight' | 'day' | 'ground';

/** "4 Nächte", "Tagesausflug" oder "1 Tag" (z. B. Trip ohne Hinflug). */
export const durationLabel = (tr: Trip) =>
  tr.dayTrip ? t('Tagesausflug') : tr.nights === 0 ? tn(1, 'Tag', 'Tage') : tn(tr.nights, 'Nacht', 'Nächte');

export function TripsScreen() {
  const d = useDerived();
  const nav = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const counts = {
    all: d.trips.length,
    overnight: d.trips.filter((x) => !x.dayTrip).length,
    day: d.trips.filter((x) => x.dayTrip).length,
    ground: d.trips.filter((x) => x.kind === 'manual').length,
  };
  const list = d.trips.filter((x) =>
    filter === 'overnight' ? !x.dayTrip : filter === 'day' ? x.dayTrip : filter === 'ground' ? x.kind === 'manual' : true,
  );
  const years = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const x of list) m.set(x.start.slice(0, 4), [...(m.get(x.start.slice(0, 4)) ?? []), x]);
    return [...m.entries()];
  }, [list]);

  return (
    <>
      <NavBar
        title={t('Trips')}
        right={
          <button class="icon-btn mat press accent" aria-label={t('Reise ohne Flug anlegen')} onClick={() => openTripEdit()}>
            <Icon name="plus" stroke={2.3} />
          </button>
        }
      />
      <LargeTitle sub={d.trips.length ? `${tn(counts.overnight, 'Reise', 'Reisen')} · ${tn(counts.day, 'Tagesausflug', 'Tagesausflüge')}` : undefined}>
        {t('Trips')}
      </LargeTitle>
      {d.trips.length > 0 && (
        <div class="chips">
          <Chip on={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            {t('Alle')}
          </Chip>
          <Chip on={filter === 'overnight'} onClick={() => setFilter('overnight')} count={counts.overnight}>
            {t('Mit Übernachtung')}
          </Chip>
          <Chip on={filter === 'day'} onClick={() => setFilter('day')} count={counts.day}>
            {t('Tagesausflüge')}
          </Chip>
          <Chip on={filter === 'ground'} onClick={() => setFilter('ground')} count={counts.ground}>
            {t('Ohne Flug')}
          </Chip>
        </div>
      )}
      {!d.trips.length && (
        <Empty
          icon="suitcase"
          title={t('Noch keine Trips')}
          text={t('Trips entstehen automatisch aus deinen Flügen. Reisen mit Auto oder Zug legst du mit + selbst an.')}
          action={
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button class="btn press" onClick={() => openTripEdit()}>
                <Icon name="train" /> {t('Reise anlegen')}
              </button>
              <button class="btn primary press" onClick={openImport}>
                <Icon name="download" /> {t('Flüge importieren')}
              </button>
            </div>
          }
        />
      )}
      {years.map(([year, trips]) => (
        <section key={`${year}-${filter}`}>
          <div class="year-head">
            <b>{year}</b>
            <span>
              {tn(trips.length, 'Trip', 'Trips')} · {tn(new Set(trips.flatMap((x) => x.countries)).size, 'Land', 'Länder')}
            </span>
          </div>
          <div class="timeline stagger">
            {trips.map((x, i) => (
              <TripCard key={x.id} tr={x} i={i} onClick={() => nav.push(<TripDetail id={x.id} />)} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function TripCard({ tr, i, onClick }: { tr: Trip; i: number; onClick: () => void }) {
  return (
    <button class={`trip-card press ${tr.dayTrip ? 'day' : ''} ${tr.kind === 'manual' ? 'manual' : ''}`} style={stagger(i)} onClick={onClick}>
      <div class="t">{tr.name}</div>
      <div class="s">
        {fmtRange(tr.start, tr.end)} · {durationLabel(tr)}
      </div>
      <div class="meta">
        {tr.countries.length > 0 && <span class="flags">{countryFlags(tr.countries, 6)}</span>}
        {tr.dayTrip && (
          <span class="badge day">
            <Icon name="sun" /> {t('Tagesausflug')}
          </span>
        )}
        {tr.kind === 'manual' && (
          <span class="badge ok">
            <Icon name={modeIcon(tr.mode)} /> {modeName(tr.mode)}
          </span>
        )}
        {tr.kind === 'flight' && tr.km > 0 && <span class="badge">{fmtInt(tr.km)} km</span>}
        {(tr.noOutbound || tr.noReturn) && <span class="badge warn">{tr.noOutbound ? t('Hinflug fehlt') : t('Rückflug fehlt')}</span>}
      </div>
    </button>
  );
}

// ---------- Trip-Details ----------
export function TripDetail({ id }: { id: string }) {
  const data = useData();
  const d = useDerived();
  const nav = useNav();
  const st = getStatic();
  const tr = d.tripById.get(id);
  if (!tr)
    return (
      <>
        <NavBar back />
        <Empty icon="suitcase" title={t('Trip nicht mehr vorhanden')} text={t('Er wurde zusammengeführt, geteilt oder gelöscht.')} />
      </>
    );
  const ov = data.tripOverrides[id] ?? {};
  const ap = (c: string) => data.airports[c];

  const arcs: MapArc[] = [];
  const airports: MapDot[] = [];
  const pts: [number, number][] = [];
  const seen = new Set<string>();
  for (const it of tr.items) {
    if (it.kind === 'flight') {
      const a = ap(it.flight.dep);
      const b = ap(it.flight.arr);
      if (a && b) arcs.push({ key: it.flight.id, d: arcPath([a.lon, a.lat], [b.lon, b.lat]) });
    } else if (it.kind === 'ground') {
      const a = ap(it.from);
      const b = ap(it.to);
      if (a && b) arcs.push({ key: `g${it.from}${it.to}`, d: arcPath([a.lon, a.lat], [b.lon, b.lat]), cls: 'ground' });
    } else if (!seen.has(it.iata)) {
      seen.add(it.iata);
      const a = ap(it.iata);
      if (a) {
        const [x, y] = project(a.lon, a.lat);
        pts.push([x, y]);
        airports.push({ key: it.iata, x, y, cls: it.role === 'start' || it.role === 'end' ? 'hub' : '' });
      }
    }
  }
  const dots = tr.cities.map((c) => {
    const [x, y] = project(c.lon, c.lat);
    pts.push([x, y]);
    return { key: c.id, x, y };
  });
  let box = boxOfPoints(pts);
  if (!box && tr.countries.length) {
    const bbs = tr.countries.map((c) => st.mapByCode.get(c)?.bb).filter(Boolean) as [number, number, number, number][];
    box = bbs.length ? [Math.min(...bbs.map((b) => b[0])), Math.min(...bbs.map((b) => b[1])), Math.max(...bbs.map((b) => b[2])), Math.max(...bbs.map((b) => b[3]))] : null;
  }
  const status: Record<string, string> = {};
  for (const c of d.countries.values()) if (c.visited) status[c.code] = 'v';

  const setOv = (patch: Partial<TripOverride>) =>
    updateData((dd) => ({ ...dd, tripOverrides: { ...dd.tripOverrides, [id]: { ...dd.tripOverrides[id], ...patch } } }));

  const flightTrips = d.trips.filter((x) => x.kind === 'flight').sort((a, b) => a.start.localeCompare(b.start));
  const next = tr.kind === 'flight' ? flightTrips[flightTrips.indexOf(tr) + 1] : undefined;
  const joined = tr.flights.some((f) => data.tripJoins.includes(f.id));
  const splitAt = tr.flights[0] && data.tripSplits.includes(tr.flights[0].id);

  return (
    <>
      <NavBar
        back
        title={tr.name}
        right={
          <button class="icon-btn mat press" aria-label={t('Bearbeiten')} onClick={() => (tr.kind === 'manual' ? openTripEdit(tr.manual) : openRename(id, tr.name, tr.autoName))}>
            <Icon name="pencil" />
          </button>
        }
      />
      {box && <MiniMap box={box} highlight={tr.countries} status={status} arcs={arcs} airports={airports} dots={dots} aspect={1.7} pad={0.3} />}
      <div class="hero" style={{ paddingTop: '18px' }}>
        <h1>{tr.name}</h1>
        <div class="sub">{fmtRange(tr.start, tr.end)}</div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          {tr.dayTrip && (
            <span class="badge day">
              <Icon name="sun" /> {t('Tagesausflug')}
            </span>
          )}
          {tr.kind === 'manual' && (
            <span class="badge ok">
              <Icon name={modeIcon(tr.mode)} /> {modeName(tr.mode)}
            </span>
          )}
          {ov.outboundMode && <span class="badge ok">{t('Hinreise: {m}', { m: modeName(ov.outboundMode) })}</span>}
          {ov.returnMode && <span class="badge ok">{t('Rückreise: {m}', { m: modeName(ov.returnMode) })}</span>}
          {tr.domestic && <span class="badge">{t('Inland')}</span>}
        </div>
      </div>

      <div class="stat-grid stagger">
        <div class="stat" style={stagger(0)}>
          <div class="v">{tr.dayTrip || tr.nights === 0 ? '1' : tr.nights}</div>
          <div class="l">{tr.dayTrip || tr.nights === 0 ? t('Tag') : tw(tr.nights, 'Nacht', 'Nächte')}</div>
        </div>
        <div class="stat" style={stagger(1)}>
          <div class="v">{tr.countries.length}</div>
          <div class="l">{tw(tr.countries.length, 'Land', 'Länder')}</div>
        </div>
        {tr.kind === 'flight' && (
          <>
            <div class="stat" style={stagger(2)}>
              <div class="v">
                {fmtInt(tr.km)}
                <small>km</small>
              </div>
              <div class="l">{tn(tr.flights.length, 'Flug', 'Flüge')}</div>
            </div>
            <div class="stat" style={stagger(3)}>
              <div class="v" style={{ fontSize: '22px' }}>
                {fmtDuration(tr.minutes)}
              </div>
              <div class="l">{t('Flugzeit')}</div>
            </div>
          </>
        )}
      </div>

      {(tr.noOutbound || tr.noReturn) && (
        <>
          <SectionTitle>{t('Hinweis')}</SectionTitle>
          <div class="card">
            <div style={{ fontSize: '14.5px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.45 }}>
              {tr.noOutbound
                ? t('Dieser Trip beginnt nicht zuhause. Bist du auf dem Landweg hingereist?')
                : t('Dieser Trip endet nicht zuhause. Bist du auf dem Landweg zurück (oder läuft er noch)?')}
            </div>
            <div class="chips" style={{ padding: 0, flexWrap: 'wrap' }}>
              {(['train', 'car', 'bus', 'boat', 'other'] as TravelMode[]).map((m) => (
                <Chip onClick={() => setOv(tr.noOutbound ? { outboundMode: m } : { returnMode: m })}>
                  <Icon name={modeIcon(m)} size={15} /> {modeName(m)}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}

      {tr.items.length > 0 && (
        <>
          <SectionTitle>{t('Route')}</SectionTitle>
          <RouteList items={tr.items} onFlight={(fid) => nav.push(<FlightDetail id={fid} />)} />
        </>
      )}

      <SectionTitle
        action={t('Landweg')}
        onAction={async () => {
          const base = tr.kind === 'manual' ? tr.manual!.countries : (ov.extraCountries ?? []);
          const res = await pickCountries(base, tr.kind === 'manual' ? t('Länder der Reise') : t('Auf dem Landweg'));
          if (!res) return;
          if (tr.kind === 'manual') updateData((dd) => ({ ...dd, manualTrips: dd.manualTrips.map((m) => (m.id === tr.manual!.id ? { ...m, countries: res } : m)) }));
          else setOv({ extraCountries: res });
        }}
      >
        {t('Länder')}
      </SectionTitle>
      {tr.countries.length ? (
        <div class="list">
          {tr.countries.map((c) => (
            <Row
              lead={flag(c)}
              leadClass="flag"
              title={countryName(c)}
              sub={ov.extraCountries?.includes(c) ? t('Auf dem Landweg') : undefined}
              chevron
              onClick={() => nav.push(<CountryDetail code={c} />)}
            />
          ))}
        </div>
      ) : (
        <p class="hint" style={{ marginTop: 0 }}>
          {t('Nur im Heimatland unterwegs.')}
        </p>
      )}

      <SectionTitle action={t('Hinzufügen')} onAction={() => openCityAdd(tr.countries[0])}>
        {t('Städte')}
      </SectionTitle>
      {tr.cities.length ? (
        <div class="list">
          {tr.cities.map((c) => (
            <Row lead={flag(c.cc)} leadClass="flag" title={cityName(c)} sub={countryName(c.cc)} chevron onClick={() => openCity(c.id)} />
          ))}
        </div>
      ) : (
        <p class="hint" style={{ marginTop: 0 }}>
          {t('Noch keine Städte zugeordnet.')}
        </p>
      )}

      <SectionTitle>{t('Notiz')}</SectionTitle>
      <NoteCard
        value={tr.note ?? ''}
        onSave={(note) =>
          tr.kind === 'manual'
            ? updateData((dd) => ({ ...dd, manualTrips: dd.manualTrips.map((m) => (m.id === tr.manual!.id ? { ...m, note: note || undefined } : m)) }))
            : setOv({ note: note || undefined })
        }
      />

      {tr.kind === 'flight' && (
        <>
          <SectionTitle>{t('Aufteilung')}</SectionTitle>
          <div class="list">
            {next && (
              <Row
                lead={<Icon name="merge" />}
                title={t('Mit nächstem Trip zusammenführen')}
                sub={`${next.name} · ${fmtDate(next.start)}`}
                onClick={async () => {
                  const ok = await confirmSheet({
                    title: t('Trips zusammenführen?'),
                    text: t('«{a}» und «{b}» werden ein Trip.', { a: tr.name, b: next.name }),
                    ok: t('Zusammenführen'),
                  });
                  if (!ok) return;
                  const fid = next.flights[0].id;
                  updateData((dd) => ({ ...dd, tripJoins: [...dd.tripJoins, fid], tripSplits: dd.tripSplits.filter((x) => x !== fid) }));
                  toast(t('Trips zusammengeführt'));
                }}
              />
            )}
            {tr.flights.length > 1 && <Row lead={<Icon name="split" />} title={t('Trip teilen')} sub={t('Ab einem bestimmten Flug neu beginnen')} onClick={() => openSplit(tr)} />}
            {joined && (
              <Row
                lead={<Icon name="refresh" />}
                title={t('Zusammenführung lösen')}
                onClick={() => updateData((dd) => ({ ...dd, tripJoins: dd.tripJoins.filter((x) => !tr.flights.some((f) => f.id === x)) }))}
              />
            )}
            {splitAt && (
              <Row
                lead={<Icon name="refresh" />}
                title={t('Teilung aufheben')}
                onClick={() => updateData((dd) => ({ ...dd, tripSplits: dd.tripSplits.filter((x) => x !== tr.flights[0].id) }))}
              />
            )}
          </div>
        </>
      )}

      {tr.kind === 'manual' && (
        <div style={{ margin: '24px 16px 0' }}>
          <button
            class="btn danger block press"
            onClick={async () => {
              const ok = await confirmSheet({ title: t('Reise löschen?'), text: t('«{a}» wird gelöscht.', { a: tr.name }), ok: t('Löschen'), danger: true });
              if (!ok) return;
              updateData((dd) => ({ ...dd, manualTrips: dd.manualTrips.filter((m) => m.id !== tr.manual!.id) }));
              setTimeout(goBack, 80);
            }}
          >
            <Icon name="trash" /> {t('Reise löschen')}
          </button>
        </div>
      )}
    </>
  );
}

function RouteList({ items, onFlight }: { items: TripItem[]; onFlight: (id: string) => void }) {
  const data = useData();
  const ap = (c: string) => data.airports[c];
  const ROLE: Record<string, string> = { start: 'Abflug', end: 'Ankunft', dest: 'Ziel', layover: 'Umstieg' };
  return (
    <div class="route">
      {items.map((it, i) => {
        const pos = i === 0 ? 'first' : i === items.length - 1 ? 'last' : '';
        if (it.kind === 'airport') {
          const a = ap(it.iata);
          const tz = a?.tz ?? 'UTC';
          const times = [it.arrTs ? `${t('an')} ${localTime(it.arrTs, tz)}` : '', it.depTs ? `${t('ab')} ${localTime(it.depTs, tz)}` : ''].filter(Boolean).join(' · ');
          return (
            <div class={`route-item ${pos} ${it.role === 'layover' ? 'layover' : ''} ${it.role === 'start' || it.role === 'end' ? 'home' : ''}`}>
              <div class="line" />
              <div class="pin" />
              <div>
                <div class="rt">
                  {airportCity(a, it.iata)} <span style={{ color: 'var(--text3)', fontWeight: 600 }}>{it.iata}</span>
                </div>
                <div class="rs">
                  {t(ROLE[it.role])}
                  {it.role === 'layover' && it.arrTs && it.depTs ? ` · ${fmtDuration((it.depTs - it.arrTs) / 60000)}` : ''}
                </div>
              </div>
              <div class="rr">{times}</div>
            </div>
          );
        }
        if (it.kind === 'ground') {
          return (
            <div class="route-item ground">
              <div class="line" />
              <div />
              <div class="rt">
                <Icon name="route" size={14} /> {t('Bodenstrecke')} {it.from} → {it.to}
              </div>
              <div />
            </div>
          );
        }
        const f = it.flight;
        return (
          <button class="route-item leg press" style={{ width: '100%', textAlign: 'left', '--press': '0.98' }} onClick={() => onFlight(f.id)}>
            <div class="line" />
            <div />
            <div class="rt">
              ✈ {displayFlightNo(f)} · {fmtDuration((f.arrTs - f.depTs) / 60000)}
            </div>
            <div class="rr">
              <Icon name="chevR" size={14} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Sheets ----------
function openRename(id: string, current: string, auto: string) {
  openSheet(() => <RenameSheet id={id} current={current} auto={auto} />);
}

function RenameSheet({ id, current, auto }: { id: string; current: string; auto: string }) {
  const [name, setName] = useState(current);
  const save = (v: string | undefined) => {
    updateData((dd) => ({ ...dd, tripOverrides: { ...dd.tripOverrides, [id]: { ...dd.tripOverrides[id], name: v } } }));
    closeSheet();
  };
  return (
    <>
      <SheetHeader title={t('Trip umbenennen')} />
      <div class="sheet-body">
        <label class="field">
          <span>{t('Name')}</span>
          <input value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} enterKeyHint="done" />
        </label>
        <p class="hint" style={{ marginTop: 0, marginBottom: '14px' }}>
          {t('Automatisch: {n}', { n: auto })}
        </p>
        <div class="sheet-actions">
          <button class="btn press" onClick={() => save(undefined)}>
            {t('Zurücksetzen')}
          </button>
          <button class="btn primary press" disabled={!name.trim()} onClick={() => save(name.trim())}>
            {t('Speichern')}
          </button>
        </div>
      </div>
    </>
  );
}

function openSplit(tr: Trip) {
  openSheet(() => (
    <>
      <SheetHeader title={t('Trip teilen')} />
      <div class="sheet-body">
        <p class="hint" style={{ margin: '0 20px 14px' }}>
          {t('Ab welchem Flug soll ein neuer Trip beginnen?')}
        </p>
        <div class="list plain">
          {tr.flights.slice(1).map((f) => (
            <Row
              lead={<Icon name="plane" />}
              title={`${f.dep} → ${f.arr}`}
              sub={`${displayFlightNo(f)} · ${fmtDate(new Date(f.depTs).toISOString().slice(0, 10))}`}
              chevron
              onClick={() => {
                updateData((dd) => ({ ...dd, tripSplits: [...dd.tripSplits, f.id], tripJoins: dd.tripJoins.filter((x) => x !== f.id) }));
                closeSheet();
                toast(t('Trip geteilt'));
              }}
            />
          ))}
        </div>
      </div>
    </>
  ));
}

export function openTripEdit(existing?: ManualTrip) {
  openSheet(() => <TripEditSheet existing={existing} />, { tall: true });
}

const MODES: TravelMode[] = ['train', 'car', 'bus', 'boat', 'other'];

function TripEditSheet({ existing }: { existing?: ManualTrip }) {
  const data = useData();
  const [name, setName] = useState(existing?.name ?? '');
  const [start, setStart] = useState(existing?.start ?? todayYmd());
  const [end, setEnd] = useState(existing?.end ?? '');
  const [mode, setMode] = useState<TravelMode>(existing?.mode ?? 'train');
  const [countries, setCountries] = useState<string[]>(existing?.countries ?? []);
  const valid = !!start && countries.length > 0;

  const save = () => {
    const trip: ManualTrip = {
      id: existing?.id ?? uid(),
      name: name.trim() || countries.map(countryName).join(' · '),
      start,
      end: end && end >= start ? end : start,
      mode,
      countries,
      note: existing?.note,
    };
    updateData((dd) => ({
      ...dd,
      manualTrips: existing ? dd.manualTrips.map((m) => (m.id === trip.id ? trip : m)) : [...dd.manualTrips, trip],
    }));
    closeSheet();
    toast(existing ? t('Reise gespeichert') : t('Reise angelegt'));
  };

  return (
    <>
      <SheetHeader
        title={existing ? t('Reise bearbeiten') : t('Reise ohne Flug')}
        action={
          <button class="btn primary small press" disabled={!valid} onClick={save}>
            {t('Sichern')}
          </button>
        }
      />
      <div class="sheet-body">
        <div class="chips" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
          {MODES.map((m) => (
            <Chip on={mode === m} onClick={() => setMode(m)}>
              <Icon name={modeIcon(m)} size={16} /> {modeName(m)}
            </Chip>
          ))}
        </div>
        <label class="field">
          <span>{t('Name')}</span>
          <input value={name} placeholder={t('z. B. Roadtrip Toskana')} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <div class="field-row">
          <label class="field">
            <span>{t('Von')}</span>
            <input type="date" value={start} onInput={(e) => setStart((e.currentTarget as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>{t('Bis')}</span>
            <input type="date" value={end} min={start} onInput={(e) => setEnd((e.currentTarget as HTMLInputElement).value)} />
          </label>
        </div>
        <SectionTitle
          action={countries.length ? t('Ändern') : undefined}
          onAction={async () => {
            const r = await pickCountries(countries, t('Länder der Reise'));
            if (r) setCountries(r);
          }}
        >
          {t('Durchquerte Länder')}
        </SectionTitle>
        {countries.length ? (
          <div class="chips" style={{ flexWrap: 'wrap' }}>
            {countries.map((c) => (
              <Chip on onClick={() => setCountries(countries.filter((x) => x !== c))}>
                {flag(c)} {countryName(c)} <Icon name="x" size={13} stroke={2.6} />
              </Chip>
            ))}
          </div>
        ) : (
          <div style={{ margin: '0 16px' }}>
            <button
              class="btn block press"
              onClick={async () => {
                const r = await pickCountries([], t('Länder der Reise'));
                if (r) setCountries(r);
              }}
            >
              <Icon name="plus" /> {t('Länder wählen')}
            </button>
          </div>
        )}
        <p class="hint">
          {t('Alle Länder auf der Reise zählen als besucht, auch reine Durchfahrten. Dein Heimatland ({c}) musst du nicht wählen.', {
            c: countryName(data.settings.home),
          })}
        </p>
      </div>
    </>
  );
}
