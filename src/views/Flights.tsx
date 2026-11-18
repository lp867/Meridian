import { useMemo, useRef, useState } from 'preact/hooks';
import { useData } from '../lib/store';
import { airportCity, displayFlightNo, useDerived, type Issue } from '../lib/derive';
import { arcPath, project } from '../lib/geo';
import { fmt1, fmtDate, fmtDuration, fmtHours, fmtInt, localDateLong, localTime, normalize } from '../lib/format';
import { importFlightVault, type ImportReport } from '../lib/importFv';
import { t, tn } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { AnimatedNumber, Chip, Empty, LargeTitle, NavBar, Row, SearchField, SectionTitle, Segmented, Swap, stagger } from '../ui/kit';
import { SheetHeader, closeSheet, openSheet } from '../ui/Sheet';
import { navRegistry, useNav, type Nav } from '../ui/Stack';
import { MiniMap, WorldMap, boxOfPoints, type MapArc, type MapDot } from '../ui/WorldMap';
import { toast } from '../ui/Toast';
import { goBackThen } from '../lib/backstack';
import type { Flight } from '../lib/types';

type Mode = 'list' | 'stats' | 'map' | 'planes';
const ymdUtc = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export function FlightsScreen() {
  const data = useData();
  const d = useDerived();
  const nav = useNav();
  const [mode, setMode] = useState<Mode>('list');

  return (
    <>
      <NavBar
        back
        title={t('Flüge')}
        right={
          <button class="icon-btn mat press" aria-label={t('FlightVault importieren')} onClick={openImport}>
            <Icon name="download" />
          </button>
        }
      />
      <LargeTitle sub={data.flights.length ? `${tn(d.stats.count, 'Flug', 'Flüge')} · ${fmtInt(d.stats.km)} km` : undefined}>{t('Flüge')}</LargeTitle>
      {!data.flights.length ? (
        <Empty
          icon="plane"
          title={t('Noch keine Flüge')}
          text={t('Importiere deinen Export aus FlightVault. Besuchte Länder und die Karte füllen sich dann automatisch.')}
          action={
            <button class="btn primary press" onClick={openImport}>
              <Icon name="download" /> {t('FlightVault importieren')}
            </button>
          }
        />
      ) : (
        <>
          <div style={{ margin: '0 16px 14px' }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'list', label: t('Liste') },
                { value: 'stats', label: t('Statistik') },
                { value: 'map', label: t('Karte') },
                { value: 'planes', label: t('Flugzeuge') },
              ]}
            />
          </div>
          <Swap value={mode} order={['list', 'stats', 'map', 'planes']}>
            {mode === 'list' && <FlightList nav={nav} />}
            {mode === 'stats' && <Stats nav={nav} />}
            {mode === 'map' && <RouteMap />}
            {mode === 'planes' && <Planes />}
          </Swap>
        </>
      )}
    </>
  );
}

function FlightList({ nav }: { nav: Nav }) {
  const data = useData();
  const d = useDerived();
  const [q, setQ] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const years = d.stats.years.map((y) => y.year).reverse();
  const flightIssues = d.issues;

  const groups = useMemo(() => {
    const n = normalize(q);
    const list = [...data.flights]
      .sort((a, b) => b.depTs - a.depTs)
      .filter((f) => {
        if (year && new Date(f.depTs).getUTCFullYear() !== year) return false;
        if (!n) return true;
        const a = data.airports[f.dep];
        const b = data.airports[f.arr];
        const hay = normalize(
          [displayFlightNo(f), f.reg, f.dep, f.arr, ...(a?.cityNames ?? [a?.city]), ...(b?.cityNames ?? [b?.city]), f.airlineName, f.aircraftName].filter(Boolean).join(' '),
        );
        return hay.includes(n);
      });
    const m = new Map<number, Flight[]>();
    for (const f of list) {
      const y = new Date(f.depTs).getUTCFullYear();
      m.set(y, [...(m.get(y) ?? []), f]);
    }
    return [...m.entries()];
  }, [data, q, year]);

  return (
    <>
      {d.issues.length > 0 && (
        <button class="card press" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px', width: 'calc(100% - 32px)', textAlign: 'left', '--press': '1.015' }} onClick={openDataCheck}>
          <div style={{ width: '36px', height: '36px', borderRadius: '11px', display: 'grid', placeItems: 'center', background: 'var(--wish-tint)', color: 'var(--wish)', flex: 'none' }}>
            <Icon name="alert" size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650 }}>{t('Datencheck')}</div>
            <div style={{ fontSize: '13.5px', color: 'var(--text2)' }}>
              {tn(d.issues.length, 'Hinweis', 'Hinweise')}
              {flightIssues.length ? ` · ${t('{n} prüfen', { n: tn(flightIssues.length, 'Flug', 'Flüge') })}` : ''}
            </div>
          </div>
          <Icon name="chevR" size={16} />
        </button>
      )}
      <SearchField value={q} onInput={setQ} placeholder={t('Flugnummer, Registrierung, Flughafen')} />
      <div class="chips" style={{ marginTop: '12px' }}>
        <Chip on={year === null} onClick={() => setYear(null)}>
          {t('Alle Jahre')}
        </Chip>
        {years.map((y) => (
          <Chip on={year === y} onClick={() => setYear(y)}>
            {y}
          </Chip>
        ))}
      </div>
      {!groups.length && <Empty icon="search" title={t('Kein Flug gefunden')} text={t('Nichts passt zu «{q}».', { q })} />}
      {groups.map(([y, flights]) => (
        <div key={`${y}-${q}-${year}`}>
          <SectionTitle>
            {y}
            <span style={{ marginLeft: '8px', color: 'var(--text3)' }}>{tn(flights.length, 'Flug', 'Flüge')}</span>
          </SectionTitle>
          <div class="list stagger">
            {flights.map((f, i) => (
              <FlightRow key={f.id} f={f} i={i} onClick={() => nav.push(<FlightDetail id={f.id} />)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function FlightRow({ f, i, onClick }: { f: Flight; i: number; onClick: () => void }) {
  const data = useData();
  const a = data.airports[f.dep];
  const b = data.airports[f.arr];
  return (
    <Row
      style={{ ...stagger(i), contentVisibility: i > 16 ? 'auto' : undefined, containIntrinsicSize: '58px' }}
      lead={<span style={{ fontSize: '12.5px', fontWeight: 800, letterSpacing: '-0.02em' }}>{f.airlineCode ?? '✈'}</span>}
      title={`${airportCity(a, f.dep)} → ${airportCity(b, f.arr)}`}
      sub={`${displayFlightNo(f)} · ${a ? localDateLong(f.depTs, a.tz) : fmtDate(ymdUtc(f.depTs))}`}
      trail={<span class="num">{fmtDuration((f.arrTs - f.depTs) / 60000)}</span>}
      chevron
      onClick={onClick}
    />
  );
}

// ---------- Flug-Details ----------
export function FlightDetail({ id }: { id: string }) {
  const data = useData();
  const d = useDerived();
  const nav = useNav();
  const f = data.flights.find((x) => x.id === id);
  if (!f)
    return (
      <>
        <NavBar back />
        <Empty icon="plane" title={t('Flug nicht gefunden')} text="" />
      </>
    );
  const a = data.airports[f.dep];
  const b = data.airports[f.arr];
  const km = d.flightKm(f);
  const arcs: MapArc[] = a && b ? [{ key: f.id, d: arcPath([a.lon, a.lat], [b.lon, b.lat]) }] : [];
  const pts: [number, number][] = [];
  const dots: MapDot[] = [];
  for (const [code, ap] of [
    [f.dep, a],
    [f.arr, b],
  ] as const) {
    if (!ap) continue;
    const [x, y] = project(ap.lon, ap.lat);
    pts.push([x, y]);
    dots.push({ key: code, x, y });
  }
  const box = boxOfPoints(pts);
  const kv: [string, string | undefined][] = [
    [t('Datum'), a ? localDateLong(f.depTs, a.tz) : undefined],
    [t('Flugnummer'), displayFlightNo(f)],
    [t('Airline'), f.airlineName ?? f.airlineCode],
    [t('Flugzeug'), f.aircraftName ?? f.aircraftCode],
    [t('Registrierung'), f.reg],
    [t('Sitz'), f.seat],
    [t('Klasse'), f.travelClass],
    [t('Distanz'), km ? `${fmtInt(km)} km` : undefined],
    [t('Dauer'), fmtDuration((f.arrTs - f.depTs) / 60000)],
    [t('Ankunft'), b ? localDateLong(f.arrTs, b.tz) : undefined],
  ];

  return (
    <>
      <NavBar back title={`${f.dep} → ${f.arr}`} />
      {box && <MiniMap box={box} arcs={arcs} airports={dots} aspect={2} pad={0.45} />}
      <div class="flight-hero" style={{ paddingTop: '18px' }}>
        <div>
          <div class="code">{f.dep}</div>
          <div class="city">{airportCity(a, f.depName ?? '')}</div>
          <div class="time">{a ? localTime(f.depTs, a.tz) : '–'}</div>
        </div>
        <div class="mid">
          <Icon name="plane" />
          <span>{fmtDuration((f.arrTs - f.depTs) / 60000)}</span>
        </div>
        <div class="r">
          <div class="code">{f.arr}</div>
          <div class="city">{airportCity(b, f.arrName ?? '')}</div>
          <div class="time">{b ? localTime(f.arrTs, b.tz) : '–'}</div>
        </div>
      </div>
      <div class="list plain">
        {kv
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div class="kv">
              <span class="k">{k}</span>
              <span class="v">{v}</span>
            </div>
          ))}
      </div>
      <p class="hint">{t('Alle Zeiten in Ortszeit des jeweiligen Flughafens.')}</p>
      {f.comments && (
        <>
          <SectionTitle>{t('Kommentar')}</SectionTitle>
          <div class="card" style={{ fontSize: '15px', lineHeight: 1.5, whiteSpace: 'pre-wrap', userSelect: 'text' }}>
            {f.comments}
          </div>
        </>
      )}
    </>
  );
}

// ---------- Statistik ----------
function Stats({ nav }: { nav: Nav }) {
  const d = useDerived();
  const data = useData();
  const s = d.stats;
  const [metric, setMetric] = useState<'count' | 'km'>('count');
  const max = Math.max(...s.years.map((y) => (metric === 'count' ? y.count : y.km)), 1);
  const toplist = (title: string, items: { name: string; count: number }[], label?: (n: string) => string) =>
    items.length > 0 && (
      <>
        <SectionTitle>{title}</SectionTitle>
        <div class="list plain">
          {items.slice(0, 5).map((it, i) => (
            <div class="kv">
              <span class="k">
                <span style={{ color: 'var(--text3)', marginRight: '10px' }}>{i + 1}</span>
                <span style={{ color: 'var(--text)' }}>{label ? label(it.name) : it.name}</span>
              </span>
              <span class="v num">{it.count}×</span>
            </div>
          ))}
        </div>
      </>
    );
  const longF = s.longest;
  const shortF = s.shortest;

  return (
    <div>
      <div class="stat-grid stagger">
        <div class="stat" style={stagger(0)}>
          <div class="v">
            <AnimatedNumber value={s.km} />
            <small>km</small>
          </div>
          <div class="l">{t('Distanz')}</div>
        </div>
        <div class="stat" style={stagger(1)}>
          <div class="v">
            <AnimatedNumber value={Math.round(s.minutes / 60)} />
            <small>h</small>
          </div>
          <div class="l">{t('in der Luft')}</div>
        </div>
        <div class="stat" style={stagger(2)}>
          <div class="v">
            <AnimatedNumber value={s.km / 40075} format={fmt1} />
            <small>×</small>
          </div>
          <div class="l">{t('um die Erde')}</div>
        </div>
        <div class="stat" style={stagger(3)}>
          <div class="v">
            <AnimatedNumber value={s.airports} />
          </div>
          <div class="l">{t('Flughäfen')}</div>
        </div>
      </div>

      <SectionTitle>{t('Pro Jahr')}</SectionTitle>
      <div class="card">
        <Segmented
          value={metric}
          onChange={setMetric}
          style={{ marginBottom: '16px' }}
          options={[
            { value: 'count', label: t('Flüge') },
            { value: 'km', label: t('Kilometer') },
          ]}
        />
        <div class="bars" key={metric}>
          {s.years.map((y, i) => {
            const v = metric === 'count' ? y.count : y.km;
            return (
              <div class="bar">
                <b class="num">{metric === 'count' ? v : `${fmt1(v / 1000)}k`}</b>
                <i style={{ height: `${Math.max(4, (v / max) * 80)}%`, '--i': String(i) }} />
                <span>{String(y.year).slice(2)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {(longF || shortF) && (
        <>
          <SectionTitle>{t('Rekorde')}</SectionTitle>
          <div class="list">
            {longF && (
              <Row
                lead={<Icon name="route" />}
                title={`${t('Längster')}: ${longF.dep} → ${longF.arr}`}
                sub={`${fmtInt(d.flightKm(longF))} km · ${fmtDuration((longF.arrTs - longF.depTs) / 60000)}`}
                chevron
                onClick={() => nav.push(<FlightDetail id={longF.id} />)}
              />
            )}
            {shortF && (
              <Row
                lead={<Icon name="route" />}
                title={`${t('Kürzester')}: ${shortF.dep} → ${shortF.arr}`}
                sub={`${fmtInt(d.flightKm(shortF))} km · ${fmtDuration((shortF.arrTs - shortF.depTs) / 60000)}`}
                chevron
                onClick={() => nav.push(<FlightDetail id={shortF.id} />)}
              />
            )}
          </div>
        </>
      )}

      {toplist(t('Top-Strecken'), s.topRoutes)}
      {toplist(t('Airlines'), s.topAirlines)}
      {toplist(t('Flugzeugtypen'), s.topAircraft)}
      {toplist(t('Flughäfen'), s.topAirports, (c) => `${airportCity(data.airports[c], c)} (${c})`)}
      {toplist(t('Klassen'), s.classes)}
      <p class="hint">
        {t('Flugzeit gesamt')}: {fmtHours(s.minutes)} · {tn(s.count, 'Flug', 'Flüge')}
      </p>
    </div>
  );
}

function RouteMap() {
  const data = useData();
  const hub = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of data.flights) {
      counts.set(f.dep, (counts.get(f.dep) ?? 0) + 1);
      counts.set(f.arr, (counts.get(f.arr) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [data.flights]);
  const { arcs, airports, box } = useMemo(() => {
    const routes = new Map<string, [string, string]>();
    for (const f of data.flights) routes.set([f.dep, f.arr].sort().join('-'), [f.dep, f.arr]);
    const arcs: MapArc[] = [];
    for (const [key, [x, y]] of routes) {
      const a = data.airports[x];
      const b = data.airports[y];
      if (a && b) arcs.push({ key, d: arcPath([a.lon, a.lat], [b.lon, b.lat]) });
    }
    const pts: [number, number][] = [];
    const airports: MapDot[] = [];
    for (const code of new Set(data.flights.flatMap((f) => [f.dep, f.arr]))) {
      const a = data.airports[code];
      if (!a) continue;
      const [px, py] = project(a.lon, a.lat);
      pts.push([px, py]);
      airports.push({ key: code, x: px, y: py, cls: code === hub ? 'hub' : '' });
    }
    return { arcs, airports, box: boxOfPoints(pts) };
  }, [data, hub]);
  return (
    <>
      <div class="mini" style={{ height: '62vh', touchAction: 'none' }}>
        <WorldMap status={{}} arcs={arcs} airports={airports} initialBox={box} />
      </div>
      <p class="hint">
        {tn(arcs.length, 'Strecke', 'Strecken')} · {tn(airports.length, 'Flughafen', 'Flughäfen')}
        {hub ? ` · ${t('Drehkreuz {c}', { c: airportCity(data.airports[hub], hub) })}` : ''}
      </p>
    </>
  );
}

function Planes() {
  const d = useDerived();
  const [q, setQ] = useState('');
  const n = normalize(q);
  const list = d.stats.regs.filter((r) => !n || normalize(`${r.reg} ${r.type} ${r.airline}`).includes(n));
  return (
    <>
      <SearchField value={q} onInput={setQ} placeholder={t('Registrierung oder Typ')} />
      <p class="hint">{t('{n} in deiner Sammlung', { n: tn(d.stats.regs.length, 'Flugzeug', 'Flugzeuge') })}</p>
      <div class="list stagger" style={{ marginTop: '12px' }}>
        {list.map((r, i) => (
          <Row
            style={{ ...stagger(i), contentVisibility: i > 16 ? 'auto' : undefined, containIntrinsicSize: '58px' }}
            lead={<span style={{ fontSize: '13px', fontWeight: 800 }}>{r.count}×</span>}
            title={r.reg}
            sub={[r.type, r.airline].filter(Boolean).join(' · ')}
            trail={<span style={{ fontSize: '13px' }}>{fmtDate(ymdUtc(r.last))}</span>}
          />
        ))}
      </div>
      {!list.length && <Empty icon="plane" title={t('Keine Registrierungen')} text={t('In deinen Flügen ist noch keine Registrierung erfasst.')} />}
    </>
  );
}

// ---------- Import ----------
export function openImport() {
  openSheet(() => <ImportSheet />);
}

export function ImportSheet({ onDone }: { onDone?: (r: ImportReport) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const run = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const r = await importFlightVault([...files]);
      setReport(r);
      onDone?.(r);
      toast(t('{n} importiert', { n: tn(r.flightsNew, 'neuer Flug', 'neue Flüge') }));
    } catch (e) {
      toast(t('Import fehlgeschlagen: {e}', { e: (e as Error).message }), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SheetHeader title={t('FlightVault importieren')} />
      <div class="sheet-body">
        {!report ? (
          <>
            <div class="list plain" style={{ marginBottom: '16px' }}>
              <Row lead={<span style={{ fontWeight: 800 }}>1</span>} title={t('FlightVault öffnen')} sub={t('Einstellungen → Daten exportieren')} />
              <Row lead={<span style={{ fontWeight: 800 }}>2</span>} title={t('Flüge und Trips als CSV sichern')} sub={t('Beide Dateien, falls vorhanden')} />
              <Row lead={<span style={{ fontWeight: 800 }}>3</span>} title={t('Hier beide Dateien auswählen')} sub={t('Erneuter Import ergänzt nur, ohne Duplikate')} />
            </div>
            <input ref={input} type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }} onChange={(e) => run((e.currentTarget as HTMLInputElement).files)} />
            <div class="sheet-actions">
              <button class="btn primary press" disabled={busy} onClick={() => input.current?.click()}>
                <Icon name="file" /> {busy ? t('Importiere …') : t('CSV-Dateien wählen')}
              </button>
            </div>
          </>
        ) : (
          <div class="pop-in">
            <div class="stat" style={{ margin: '0 16px' }}>
              <div class="v">{report.flightsNew}</div>
              <div class="l">{t('neue Flüge')}</div>
            </div>
            <p class="hint">
              {report.flightsUpdated + report.tripsUpdated > 0 && `${t('{n} bestehende Einträge aktualisiert.', { n: report.flightsUpdated + report.tripsUpdated })} `}
              {report.unknownAirports.length > 0 && `${t('Unbekannte Flughäfen: {l}.', { l: report.unknownAirports.join(', ') })} `}
              {report.skipped.length > 0 && t('Nicht erkannt: {l}.', { l: report.skipped.join(', ') })}
            </p>
            <div class="sheet-actions" style={{ marginTop: '16px' }}>
              <button class="btn primary press" onClick={closeSheet}>
                {t('Fertig')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Datencheck ----------
export function openDataCheck() {
  openSheet(() => <DataCheckSheet />, { tall: true });
}

function issueText(i: Issue): { title: string; sub: string } {
  switch (i.type) {
    case 'noClass':
      return { title: t('{r} ohne Klasse', { r: `${i.flight.dep} → ${i.flight.arr}` }), sub: `${displayFlightNo(i.flight)} · ${fmtDate(ymdUtc(i.flight.depTs))}` };
    case 'flightNo':
      return { title: t('Flugnummer {n} ohne Airline-Code', { n: i.flight.flightNumber ?? '' }), sub: `${i.flight.dep} → ${i.flight.arr} · ${fmtDate(ymdUtc(i.flight.depTs))}` };
    case 'times':
      return { title: t('Zeiten prüfen: {r}', { r: `${i.flight.dep} → ${i.flight.arr}` }), sub: `${i.why} · ${fmtDate(ymdUtc(i.flight.depTs))}` };
    case 'airport':
      return { title: t('Unbekannter Flughafen {c}', { c: i.code }), sub: t('Land und Zeitzone fehlen') };
  }
}

function DataCheckSheet() {
  const d = useDerived();
  const nav = navRegistry.active;
  return (
    <>
      <SheetHeader title={t('Datencheck')} />
      <div class="sheet-body">
        <p class="hint" style={{ margin: '0 20px 14px' }}>
          {t('Korrekturen an Flügen machst du in FlightVault und importierst danach neu.')}
        </p>
        {!d.issues.length && <Empty icon="check" title={t('Alles sauber')} text={t('Keine Auffälligkeiten gefunden.')} />}
        <div class="list plain stagger">
          {d.issues.map((i, n) => {
            const tx = issueText(i);
            const open =
              'flight' in i ? () => goBackThen(() => nav?.push(<FlightDetail id={i.flight.id} />)) : undefined;
            return (
              <Row
                style={stagger(n)}
                lead={<Icon name="plane" />}
                title={tx.title}
                sub={tx.sub}
                chevron={!!open}
                onClick={open}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

