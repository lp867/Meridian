import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { updateData, useData } from '../lib/store';
import { cityName, useDerived, type CountryStat, type Derived } from '../lib/derive';
import { CONTINENTS, continentName, countriesSorted, countryName, getStatic, project, type CountryMeta } from '../lib/geo';
import { flag, fmtDate, fmtInt, fmtMonthYear, fmtRange, normalize } from '../lib/format';
import { t, tn, tw } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Chip, Empty, NavBar, Progress, Ring, Row, SearchField, SectionTitle, Segmented, Swap, stagger } from '../ui/kit';
import { SheetHeader } from '../ui/Sheet';
import { useNav, type Nav } from '../ui/Stack';
import { MiniMap, type Box } from '../ui/WorldMap';
import { goBackThen } from '../lib/backstack';
import { CitiesPanel, openCityAdd, openCity } from './Cities';
import { showCitiesOnMap } from '../lib/mapEvents';
import type { AppData } from '../lib/types';

type Status = 'none' | 'visited' | 'wish';

function setStatus(code: string, s: Status) {
  updateData((d: AppData) => {
    const cur = d.countries[code] ?? {};
    const next = { ...cur, status: s === 'none' ? undefined : s };
    const countries = { ...d.countries };
    if (!next.status && !next.note) delete countries[code];
    else countries[code] = next;
    return { ...d, countries };
  });
}

function statusText(s: CountryStat | undefined) {
  if (!s) return '';
  if (s.home) return t('Heimatland');
  if (s.derived && s.layoverOnly) return t('Nur umgestiegen');
  if (s.derived) return tn(Math.max(1, s.trips.length), 'Besuch', 'Besuche');
  if (s.manual) return t('Von Hand markiert');
  if (s.wish) return t('Wunschliste');
  return '';
}

/** Status-Umschalter; bei belegten Ländern (Flüge, Städte) nur Info. */
function StatusControl({ code, stat }: { code: string; stat?: CountryStat }) {
  if (stat?.derived) {
    return (
      <div class="card" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <span class="badge ok">
          <Icon name="check" stroke={3} /> {t('Besucht')}
        </span>
        <span style={{ fontSize: '14px', color: 'var(--text2)' }}>
          {stat.home ? t('Dein Heimatland') : stat.layoverOnly ? t('Durch Umstieg (Touchdown zählt)') : t('Durch Flüge, Reisen oder Städte belegt')}
        </span>
      </div>
    );
  }
  const value: Status = stat?.manual ? 'visited' : stat?.wish ? 'wish' : 'none';
  return (
    <div style={{ margin: '0 16px' }}>
      <Segmented
        value={value}
        tone={value === 'visited' ? 'accent' : value === 'wish' ? 'wish' : undefined}
        onChange={(v) => setStatus(code, v)}
        options={[
          { value: 'none', label: t('Offen') },
          { value: 'visited', label: t('Besucht') },
          { value: 'wish', label: t('Wunschliste') },
        ]}
      />
    </div>
  );
}

export function CountrySheet({ code, nav }: { code: string; nav: Nav }) {
  const d = useDerived();
  const st = getStatic();
  const meta = st.byCode.get(code);
  const s = d.countries.get(code);
  return (
    <>
      <SheetHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '30px' }}>{flag(code)}</span>
            {countryName(code)}
          </span>
        }
      />
      <div class="sheet-body">
        <div style={{ padding: '0 20px 14px', color: 'var(--text2)', fontSize: '14.5px' }}>
          {meta ? continentName(meta.ct) : ''}
          {meta && !meta.k && ` · ${t('Gebiet (zählt nicht als Land)')}`}
        </div>
        <StatusControl code={code} stat={s} />
        {s?.visited && (
          <div class="stat-grid" style={{ marginTop: '12px' }}>
            <div class="stat">
              <div class="v" style={{ fontSize: '19px' }}>
                {s.first ? fmtMonthYear(s.first) : '–'}
              </div>
              <div class="l">{t('Erster Besuch')}</div>
            </div>
            <div class="stat">
              <div class="v" style={{ fontSize: '19px' }}>
                {s.trips.length} · {s.cities.length}
              </div>
              <div class="l">{t('Besuche · Städte')}</div>
            </div>
          </div>
        )}
        <div class="sheet-actions" style={{ marginTop: '16px' }}>
          <button class="btn press" onClick={() => goBackThen(() => showCitiesOnMap(code))}>
            <Icon name="building" /> {t('Städte wählen')}
          </button>
          <button class="btn primary press" onClick={() => goBackThen(() => nav.push(<CountryDetail code={code} />))}>
            {t('Details')} <Icon name="chevR" />
          </button>
        </div>
      </div>
    </>
  );
}

export function CountryDetail({ code }: { code: string }) {
  const data = useData();
  const d = useDerived();
  const nav = useNav();
  const st = getStatic();
  const meta = st.byCode.get(code);
  const map = st.mapByCode.get(code);
  const s = d.countries.get(code);
  const status: Record<string, string> = {};
  for (const c of d.countries.values()) if (c.visited) status[c.code] = 'v';
  const box: Box | null = map ? map.bb : null;
  const cityDots = (s?.cities ?? []).map((c) => {
    const [x, y] = project(c.lon, c.lat);
    return { key: c.id, x, y };
  });
  const neighbours = meta?.b ?? [];
  const name = countryName(code);

  return (
    <>
      <NavBar back title={name} />
      {box && <MiniMap box={box} highlight={[code]} status={status} dots={cityDots} aspect={1.9} pad={0.35} />}
      <div class="hero" style={{ paddingTop: '18px' }}>
        <div class="flag-big">{flag(code)}</div>
        <h1>{name}</h1>
        <div class="sub">
          {meta ? continentName(meta.ct) : ''}
          {meta && !meta.k ? ` · ${t('Gebiet')}` : ''}
          {s?.visited && statusText(s) ? ` · ${statusText(s)}` : ''}
        </div>
      </div>
      <StatusControl code={code} stat={s} />

      {s?.visited && (
        <div class="stat-grid stagger" style={{ marginTop: '12px' }}>
          <div class="stat" style={stagger(0)}>
            <div class="v" style={{ fontSize: '18px' }}>
              {fmtDate(s.first)}
            </div>
            <div class="l">{t('Erster Besuch')}</div>
          </div>
          <div class="stat" style={stagger(1)}>
            <div class="v" style={{ fontSize: '18px' }}>
              {fmtDate(s.last)}
            </div>
            <div class="l">{t('Letzter Besuch')}</div>
          </div>
          <div class="stat" style={stagger(2)}>
            <div class="v">{s.trips.length}</div>
            <div class="l">{tw(s.trips.length, 'Besuch', 'Besuche')}</div>
          </div>
          <div class="stat" style={stagger(3)}>
            <div class="v">{s.cities.length}</div>
            <div class="l">{tw(s.cities.length, 'Stadt', 'Städte')}</div>
          </div>
        </div>
      )}

      <SectionTitle action={t('Hinzufügen')} onAction={() => openCityAdd(code)}>
        {t('Städte')}
      </SectionTitle>
      {s?.cities.length ? (
        <div class="list">
          {[...s.cities]
            .sort((a, b) => b.pop - a.pop)
            .map((c) => {
              const date = c.visits.find((v) => v.date)?.date;
              return (
                <Row
                  lead={<Icon name={c.capital ? 'star' : 'building'} />}
                  title={cityName(c)}
                  sub={[c.capital ? t('Hauptstadt') : '', date ? fmtDate(date) : ''].filter(Boolean).join(' · ') || undefined}
                  chevron
                  onClick={() => openCity(c.id)}
                />
              );
            })}
        </div>
      ) : (
        <p class="hint" style={{ marginTop: 0 }}>
          {t('Noch keine Städte. Es zählen Städte ab {n} Einwohnern und alle Hauptstädte.', { n: fmtInt(data.settings.cityThreshold) })}
        </p>
      )}
      <div class="sheet-actions" style={{ marginTop: '10px' }}>
        <button class="btn press" onClick={() => showCitiesOnMap(code)}>
          <Icon name="globe" /> {t('Auf der Karte wählen')}
        </button>
      </div>


      {neighbours.length > 0 && (
        <>
          <SectionTitle>{t('Nachbarländer')}</SectionTitle>
          <div class="chips" style={{ flexWrap: 'wrap' }}>
            {neighbours.map((n) => (
              <Chip on={d.countries.get(n)?.visited} onClick={() => nav.push(<CountryDetail code={n} />)}>
                {flag(n)} {countryName(n)}
              </Chip>
            ))}
          </div>
        </>
      )}

      <SectionTitle>{t('Notiz')}</SectionTitle>
      <NoteCard
        value={data.countries[code]?.note ?? ''}
        onSave={(note) =>
          updateData((dd) => {
            const countries = { ...dd.countries };
            const cur = countries[code] ?? {};
            if (!note && !cur.status) delete countries[code];
            else countries[code] = { ...cur, note: note || undefined };
            return { ...dd, countries };
          })
        }
      />
    </>
  );
}

export function NoteCard({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const timer = useRef(0);
  useEffect(() => setText(value), [value]);
  const save = (v: string) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onSave(v.trim()), 600);
  };
  return (
    <div class="card">
      <textarea
        class="note"
        value={text}
        placeholder={placeholder ?? t('Gedanken, Tipps, Erinnerungen …')}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLTextAreaElement).value;
          setText(v);
          save(v);
        }}
        onBlur={() => {
          clearTimeout(timer.current);
          if (text.trim() !== value) onSave(text.trim());
        }}
      />
    </div>
  );
}

// ---------- Tab "Länder" ----------
type Filter = 'visited' | 'wish' | 'all';
type Sort = 'continent' | 'az' | 'date';
type Mode = 'countries' | 'cities' | 'goals';
const SORT_LABEL: Record<Sort, string> = { az: 'A–Z', continent: 'Kontinent', date: 'Datum' };

export function CountriesScreen() {
  const d = useDerived();
  const data = useData();
  const nav = useNav();
  const [mode, setMode] = useState<Mode>('countries');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const closeSearch = () => {
    setSearching(false);
    setQ('');
  };

  return (
    <>
      <div class="tab-head">
        <h1>{t('Länder')}</h1>
        {mode !== 'goals' && (
          <button class={`icon-btn mat press ${searching ? 'accent' : ''}`} aria-label={searching ? t('Suche schliessen') : t('Suchen')} onClick={() => (searching ? closeSearch() : setSearching(true))}>
            <Icon name={searching ? 'x' : 'search'} />
          </button>
        )}
      </div>
      <Overview d={d} cities={data.cities.length} />
      <div class="seg-wrap">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            closeSearch();
          }}
          options={[
            { value: 'countries', label: t('Länder') },
            { value: 'cities', label: t('Städte') },
            { value: 'goals', label: t('Ziele') },
          ]}
        />
      </div>
      {searching && mode !== 'goals' && (
        <div class="inline-search">
          <SearchField value={q} onInput={setQ} placeholder={mode === 'cities' ? t('Meine Städte durchsuchen') : t('Land suchen')} autoFocus />
        </div>
      )}
      <Swap value={mode} order={['countries', 'cities', 'goals']}>
        {mode === 'countries' && <CountryList d={d} nav={nav} q={q} />}
        {mode === 'cities' && <CitiesPanel q={q} />}
        {mode === 'goals' && <Goals d={d} />}
      </Swap>
    </>
  );
}

/** Kompakte Übersicht: Anteil der Welt, Länder, Städte, Kontinente. */
function Overview({ d, cities }: { d: Derived; cities: number }) {
  const st = getStatic();
  const share = d.visitedCount / st.countableTotal;
  const continents = CONTINENTS.filter((c) => (d.byContinent[c.code] ?? 0) > 0).length;
  return (
    <div class="overview">
      <div class="ov-ring">
        <Ring value={share} size={62} stroke={6} />
        <span class="num">{Math.round(share * 100)}%</span>
      </div>
      <div class="ov-stats">
        <div>
          <b class="num">{fmtInt(d.visitedCount)}</b>
          <span>{tw(d.visitedCount, 'Land', 'Länder')}</span>
        </div>
        <div>
          <b class="num">{fmtInt(cities)}</b>
          <span>{tw(cities, 'Stadt', 'Städte')}</span>
        </div>
        <div>
          <b class="num">
            {continents}
            <small>/6</small>
          </b>
          <span>{t('Kontinente')}</span>
        </div>
      </div>
    </div>
  );
}

function CountryList({ d, nav, q }: { d: Derived; nav: Nav; q: string }) {
  const [filter, setFilter] = useState<Filter>('visited');
  const [sort, setSort] = useState<Sort>('continent');

  const all = useMemo(
    () => countriesSorted().filter((c) => c.ct !== 'AN' && (c.k || d.countries.get(c.c)?.visited || d.countries.get(c.c)?.wish)),
    [d],
  );
  const counts = {
    visited: all.filter((c) => d.countries.get(c.c)?.visited).length,
    wish: all.filter((c) => d.countries.get(c.c)?.wish).length,
    all: all.length,
  };

  const items = useMemo(() => {
    const n = normalize(q);
    // Bei einer Suche alle Länder durchsuchen, sonst den gewählten Filter zeigen
    let list = all.filter((c) => {
      if (n) return c.n.some((x) => normalize(x).includes(n));
      const s = d.countries.get(c.c);
      if (filter === 'visited') return !!s?.visited;
      if (filter === 'wish') return !!s?.wish;
      return true;
    });
    if (sort === 'date')
      list = [...list].sort((a, b) => (d.countries.get(b.c)?.first ?? '').localeCompare(d.countries.get(a.c)?.first ?? ''));
    return list;
  }, [all, q, filter, sort, d]);

  const groups = useMemo(() => {
    if (sort !== 'continent') return [{ key: 'all', title: '', count: '', items }];
    return CONTINENTS.map((ct) => {
      const list = items.filter((c) => c.ct === ct.code);
      const total = getStatic().countableByContinent[ct.code] ?? 0;
      const visited = list.filter((c) => d.countries.get(c.c)?.visited).length;
      return { key: ct.code, title: continentName(ct.code), count: filter === 'all' && !q ? `${visited}/${total}` : String(list.length), items: list };
    }).filter((g) => g.items.length);
  }, [items, sort, filter, q]);

  const nextSort = () => setSort(sort === 'continent' ? 'az' : sort === 'az' ? 'date' : 'continent');

  return (
    <>
      {!q && (
        <div class="chips">
          <Chip on={filter === 'visited'} onClick={() => setFilter('visited')} count={counts.visited}>
            {t('Besucht')}
          </Chip>
          <Chip on={filter === 'wish'} onClick={() => setFilter('wish')} count={counts.wish}>
            {t('Wunschliste')}
          </Chip>
          <Chip on={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            {t('Alle')}
          </Chip>
          <button class="chip press chip-sort" onClick={nextSort} aria-label={t('Sortierung')}>
            <Icon name="layers" size={15} /> {t(SORT_LABEL[sort])}
          </button>
        </div>
      )}
      {!items.length &&
        (q ? (
          <Empty icon="search" title={t('Nichts gefunden')} text={t('Kein Land passt zu «{q}».', { q })} />
        ) : filter === 'visited' ? (
          <Empty icon="globe" title={t('Noch keine Länder')} text={t('Tippe auf der Karte ein Land an oder importiere deine Flüge unter Profil.')} />
        ) : (
          <Empty icon="star" title={t('Wunschliste ist leer')} text={t('Tippe auf der Karte ein Land an und wähle «Wunschliste».')} />
        ))}
      {groups.map((g) => (
        <div key={`${g.key}-${filter}-${sort}`}>
          {g.title && (
            <div class="group-head">
              <span>{g.title}</span>
              <span class="num">{g.count}</span>
            </div>
          )}
          <div class="list compact" style={!g.title ? { marginTop: '8px' } : undefined}>
            {g.items.map((c, i) => (
              <CountryRow key={c.c} c={c} s={d.countries.get(c.c)} i={i} onClick={() => nav.push(<CountryDetail code={c.c} />)} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function CountryRow({ c, s, i, onClick }: { c: CountryMeta; s?: CountryStat; i: number; onClick: () => void }) {
  const sub = s?.visited
    ? [s.first ? t('seit {d}', { d: fmtMonthYear(s.first) }) : '', s.cities.length ? tn(s.cities.length, 'Stadt', 'Städte') : ''].filter(Boolean).join(' · ') || statusText(s)
    : s?.wish
      ? t('Wunschliste')
      : c.k
        ? continentName(c.ct)
        : t('Gebiet');
  return (
    <Row
      style={{ contentVisibility: i > 20 ? 'auto' : undefined, containIntrinsicSize: '52px' }}
      lead={flag(c.c)}
      leadClass="flag"
      title={countryName(c.c)}
      sub={sub}
      trail={
        s?.visited ? (
          <span class="dot-status v" />
        ) : s?.wish ? (
          <span class="dot-status w" />
        ) : undefined
      }
      chevron
      onClick={onClick}
    />
  );
}

// ---------- Ziele ----------
const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

function Goals({ d }: { d: Derived }) {
  const data = useData();
  const st = getStatic();
  const home = data.settings.home;
  const visited = (c: string) => !!d.countries.get(c)?.visited;
  const europe = st.countries.filter((c) => c.k && c.ct === 'EU').map((c) => c.c);
  const capitals = data.cities.filter((c) => c.capital && st.byCode.get(c.cc)?.ct === 'EU' && st.byCode.get(c.cc)?.k).length;

  const goals: { title: string; members: string[]; done?: number }[] = [
    { title: t('Alle Nachbarländer von {c}', { c: countryName(home) }), members: st.byCode.get(home)?.b ?? [] },
    { title: t('Alle EU-Länder'), members: EU },
    { title: t('Ganz Europa'), members: europe },
    { title: t('Europäische Hauptstädte'), members: europe, done: capitals },
  ].filter((g) => g.members.length);

  return (
    <div class="stagger">
      {goals.map((g, i) => {
        const done = g.done ?? g.members.filter(visited).length;
        const total = g.members.length;
        return (
          <div class="card" style={{ ...stagger(i), marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px', gap: '12px' }}>
              <b style={{ fontSize: '16.5px', fontWeight: 680 }}>{g.title}</b>
              <span class="num" style={{ color: done >= total ? 'var(--ok)' : 'var(--text2)', fontWeight: 650 }}>
                {done}/{total}
              </span>
            </div>
            <Progress value={total ? done / total : 0} />
            {g.done == null && total <= 30 && (
              <div style={{ marginTop: '12px', fontSize: '22px', letterSpacing: '3px', lineHeight: 1.35 }}>
                {g.members.map((m) => (
                  <span title={countryName(m)} style={{ opacity: visited(m) ? 1 : 0.28, filter: visited(m) ? 'none' : 'grayscale(1)' }}>
                    {flag(m)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <SectionTitle>{t('Kontinente')}</SectionTitle>
      <div class="card" style={stagger(5)}>
        {CONTINENTS.map((c) => {
          const n = d.byContinent[c.code] ?? 0;
          const total = st.countableByContinent[c.code] ?? 1;
          return (
            <div class="cont-row" style={{ gridTemplateColumns: '108px 1fr 56px' }}>
              <span>{continentName(c.code)}</span>
              <Progress value={n / total} />
              <span class="n">
                {n}/{total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
