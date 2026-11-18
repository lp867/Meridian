import { useMemo, useRef, useState } from 'preact/hooks';
import { useData } from '../lib/store';
import { useDerived } from '../lib/derive';
import { CONTINENTS, continentName, getStatic, project } from '../lib/geo';
import { fmt1 } from '../lib/format';
import { t, tw } from '../lib/i18n';
import { WorldMap, unionBox, type Box, type MapApi } from '../ui/WorldMap';
import { AnimatedNumber, Progress, Ring } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { openSheet } from '../ui/Sheet';
import { useNav } from '../ui/Stack';
import { CountrySheet } from './Countries';
import { openAddPlace, openCityAdd } from './Cities';

export function MapScreen() {
  const data = useData();
  const d = useDerived();
  const st = getStatic();
  const nav = useNav();
  const api = useRef<MapApi | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [world, setWorld] = useState(false);

  const status = useMemo(() => {
    const s: Record<string, string> = {};
    for (const c of d.countries.values()) if (c.visited) s[c.code] = 'v';
    else if (c.wish) s[c.code] = 'w';
    return s;
  }, [d]);

  const dots = useMemo(
    () =>
      data.cities.map((c) => {
        const [x, y] = project(c.lon, c.lat);
        return { key: c.id, x, y };
      }),
    [data.cities],
  );

  const myBox = useMemo<Box | null>(() => {
    const boxes = [...d.countries.values()].filter((c) => c.visited).map((c) => st.mapByCode.get(c.code)?.bb as Box | undefined);
    const u = unionBox(boxes);
    if (!u) return null;
    // Mindestausschnitt: bei wenigen Ländern die Umgebung zeigen, nicht nur ein Land formatfüllend
    const cx = (u[0] + u[2]) / 2;
    const cy = (u[1] + u[3]) / 2;
    const bw = Math.max(u[2] - u[0], 150);
    const bh = Math.max(u[3] - u[1], 90);
    return [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2] as Box;
  }, [d]);

  const pct = (d.visitedCount / st.countableTotal) * 100;

  const onCountry = (code: string | null) => {
    if (!code) {
      setSelected(null);
      return;
    }
    setSelected(code);
    openSheet(() => <CountrySheet code={code} nav={nav} />, { onClose: () => setSelected(null) });
  };

  const toggleFit = () => {
    const next = !world;
    setWorld(next);
    api.current?.fitBox(next ? null : myBox);
  };

  return (
    <>
      <WorldMap
        status={status}
        selected={selected}
        dots={dots}
        onCountry={onCountry}
        onLongPress={(p) => openAddPlace(p.lon, p.lat, p.code)}
        initialBox={myBox}
        apiRef={(a) => (api.current = a)}
        padTop={open ? 330 : 130}
        padBottom={110}
      />

      <button class="map-hud mat press" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div class="hud-top">
          <div>
            <div class="hud-big">
              <AnimatedNumber value={d.visitedCount} />
              <small>{tw(d.visitedCount, 'Land', 'Länder')}</small>
            </div>
            <div class="hud-sub">
              {t('{p} der Welt', { p: `${fmt1(pct)} %` })}
              {d.territoryCount > 0 && ` · +${d.territoryCount} ${tw(d.territoryCount, 'Gebiet', 'Gebiete')}`}
              {data.cities.length > 0 && ` · ${data.cities.length} ${tw(data.cities.length, 'Stadt', 'Städte')}`}
            </div>
          </div>
          <div class="hud-ring">
            <Ring value={pct / 100} size={50} stroke={6} />
          </div>
        </div>
        <div class={`hud-more ${open ? 'open' : ''}`}>
          <div>
            <div style={{ height: '14px' }} />
            {CONTINENTS.map((c) => {
              const n = d.byContinent[c.code] ?? 0;
              const total = st.countableByContinent[c.code] ?? 1;
              return (
                <div class="cont-row">
                  <span>{continentName(c.code)}</span>
                  <Progress value={open ? n / total : 0} />
                  <span class="n">
                    {n}/{total}
                  </span>
                </div>
              );
            })}
            <div class="legend">
              <span>
                <i style={{ background: 'var(--visited)' }} />
                {t('Besucht')}
              </span>
              <span>
                <i style={{ background: 'var(--wish-map)' }} />
                {t('Wunschliste')} ({d.wishCount})
              </span>
              <span>
                <i style={{ background: 'var(--dot)', borderRadius: '50%' }} />
                {t('Städte')}
              </span>
            </div>
          </div>
        </div>
      </button>

      <div class="map-fabs">
        <button class="icon-btn mat press accent" onClick={() => openCityAdd()} aria-label={t('Stadt hinzufügen')}>
          <Icon name="plus" stroke={2.3} />
        </button>
        <button class="icon-btn mat press" onClick={toggleFit} aria-label={world ? t('Meine Länder zeigen') : t('Ganze Welt zeigen')}>
          <Icon name={world ? 'locate' : 'globe'} />
        </button>
      </div>
    </>
  );
}
