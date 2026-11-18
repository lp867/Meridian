import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import { getStatic, type MapCountry } from '../lib/geo';
import { reducedMotion } from '../lib/spring';

export type Box = [number, number, number, number];
export interface MapDot {
  key: string | number;
  x: number;
  y: number;
  cls?: string;
}
export interface MapArc {
  key: string | number;
  d: string;
  cls?: string;
}

export interface MapApi {
  fitBox: (box: Box | null, animate?: boolean) => void;
}

interface Props {
  status: Record<string, string>; // code -> 'v' | 'w'
  selected?: string | null;
  dots?: MapDot[];
  arcs?: MapArc[];
  airports?: MapDot[];
  onCountry?: (code: string | null) => void;
  initialBox?: Box | null;
  apiRef?: (api: MapApi) => void;
  padTop?: number;
  padBottom?: number;
}

/** Gemeinsame Länderflächen – ändern sich nur, wenn sich ein Status ändert. */
const CountryPaths = memo(function CountryPaths({ countries, status, statusKey }: { countries: MapCountry[]; status: Record<string, string>; statusKey: string }) {
  void statusKey;
  return (
    <>
      {countries.map((m) =>
        m.d ? <path key={m.c ?? m.d.slice(0, 12)} class={`cty ${(m.c && status[m.c]) || ''}`} d={m.d} data-c={m.c ?? undefined} /> : null,
      )}
    </>
  );
}, (a, b) => a.statusKey === b.statusKey);

const SmallStates = memo(function SmallStates({ countries, status, statusKey, selected }: { countries: MapCountry[]; status: Record<string, string>; statusKey: string; selected?: string | null }) {
  void statusKey;
  const small = countries.filter((m) => m.s && m.c);
  return (
    <>
      {small.map((m) => (
        <circle key={m.c!} class={`small-c ${status[m.c!] ?? ''} ${selected === m.c ? 'sel' : ''}`} cx={m.p[0]} cy={m.p[1]} />
      ))}
      {small.map((m) => (
        <circle key={`h${m.c}`} class="small-hit" cx={m.p[0]} cy={m.p[1]} data-c={m.c!} />
      ))}
    </>
  );
}, (a, b) => a.statusKey === b.statusKey && a.selected === b.selected);

/**
 * Interaktive Weltkarte. Während der Geste wird nur eine vorgerenderte Ebene per
 * CSS verschoben (läuft auf dem Compositor), erst danach wird das SVG neu gezeichnet.
 */
export function WorldMap({ status, selected, dots, arcs, airports, onCountry, initialBox, apiRef, padTop = 20, padBottom = 20 }: Props) {
  const st = getStatic();
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const g = useRef<SVGGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const committed = useRef<ZoomTransform>(zoomIdentity);
  const live = useRef<ZoomTransform>(zoomIdentity);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const animating = useRef(0);
  const raf = useRef(0);
  const statusKey = useMemo(() => Object.entries(status).sort().join(','), [status]);

  const M = size ? Math.round(Math.max(size.w, size.h) * 0.35) : 0;

  useLayoutEffect(() => {
    const el = root.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setSize((s) => (s && s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commit = (t: ZoomTransform) => {
    committed.current = t;
    g.current?.setAttribute('transform', `translate(${t.x + M},${t.y + M}) scale(${t.k})`);
    svg.current?.style.setProperty('--k', String(t.k));
    if (layer.current) layer.current.style.transform = '';
  };

  const applyLive = () => {
    raf.current = 0;
    const t = live.current;
    const c = committed.current;
    const r = t.k / c.k;
    const a = t.x + M - r * (c.x + M);
    const b = t.y + M - r * (c.y + M);
    if (Math.abs(r - 1) > 0.45 || Math.abs(a) > M * 0.7 || Math.abs(b) > M * 0.7) commit(t);
    else if (layer.current) layer.current.style.transform = `translate(${a}px,${b}px) scale(${r})`;
  };

  const boxTransform = (box: Box | null): ZoomTransform => {
    const { w, h } = size!;
    const b: Box = box ?? [0, 0, st.world.w, st.world.h];
    const bw = Math.max(b[2] - b[0], 8);
    const bh = Math.max(b[3] - b[1], 8);
    const availH = h - padTop - padBottom;
    const kMin = (w / st.world.w) * 0.85;
    const k = Math.max(kMin, Math.min((w - 40) / bw, (availH - 20) / bh, (w / st.world.w) * 60));
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    return zoomIdentity.translate(w / 2 - k * cx, padTop + availH / 2 - k * cy).scale(k);
  };

  useEffect(() => {
    if (!size || !root.current) return;
    const kWorld = size.w / st.world.w;
    const z = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([kWorld * 0.85, kWorld * 60])
      .translateExtent([
        [-st.world.w * 0.15, -st.world.h * 0.4],
        [st.world.w * 1.15, st.world.h * 1.4],
      ])
      .extent([
        [0, 0],
        [size.w, size.h],
      ])
      .clickDistance(6)
      .on('zoom', (e) => {
        live.current = e.transform;
        if (!raf.current) raf.current = requestAnimationFrame(applyLive);
      })
      .on('end', (e) => {
        if (animating.current) return;
        cancelAnimationFrame(raf.current);
        raf.current = 0;
        commit(e.transform);
      });
    zoomRef.current = z;
    const sel = select(root.current);
    sel.call(z).on('dblclick.zoom', null);
    const start = committed.current === zoomIdentity ? boxTransform(initialBox ?? null) : committed.current;
    live.current = start;
    z.transform(sel, start);
    commit(start);
    return () => void sel.on('.zoom', null);
  }, [size?.w, size?.h, M]);

  const fitBox = (box: Box | null, animate = true) => {
    if (!size || !zoomRef.current || !root.current) return;
    const sel = select(root.current);
    const to = boxTransform(box);
    if (!animate || reducedMotion()) {
      zoomRef.current.transform(sel, to);
      commit(to);
      return;
    }
    const from = live.current;
    const { w, h } = size;
    // van-Wijk-Interpolation: zoomt heraus und wieder hinein, wie ein Flug
    const ip = interpolateZoom([(w / 2 - from.x) / from.k, (h / 2 - from.y) / from.k, w / from.k], [(w / 2 - to.x) / to.k, (h / 2 - to.y) / to.k, w / to.k]);
    const dur = Math.min(1100, Math.max(520, ip.duration * 0.55));
    const id = ++animating.current;
    const t0 = performance.now();
    const step = (now: number) => {
      if (animating.current !== id) return;
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 1 ? 1 - Math.pow(1 - p, 3.2) : 1;
      const [cx, cy, vw] = ip(e);
      const k = w / vw;
      const t = zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k);
      zoomRef.current!.transform(sel, t);
      if (p < 1) requestAnimationFrame(step);
      else {
        animating.current = 0;
        commit(t);
      }
    };
    requestAnimationFrame(step);
  };

  useEffect(() => {
    apiRef?.({ fitBox });
  });

  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element).closest('[data-c]');
    onCountry?.(el ? el.getAttribute('data-c') : null);
  };

  const sel = selected ? st.mapByCode.get(selected) : undefined;

  return (
    <div class="map-root" ref={root} onClick={onClick}>
      {size && (
        <div class="map-layer" ref={layer} style={{ left: `${-M}px`, top: `${-M}px`, width: `${size.w + 2 * M}px`, height: `${size.h + 2 * M}px`, willChange: 'transform' }}>
          <svg class="map-svg" ref={svg} width={size.w + 2 * M} height={size.h + 2 * M}>
            <g ref={g}>
              <CountryPaths countries={st.world.countries} status={status} statusKey={statusKey} />
              {sel?.d && <path class="cty sel" d={sel.d} style={{ fill: 'none', pointerEvents: 'none' }} />}
              <SmallStates countries={st.world.countries} status={status} statusKey={statusKey} selected={selected} />
              {arcs?.map((a) => <path key={a.key} class={`arc ${a.cls ?? ''}`} d={a.d} />)}
              {airports?.map((d) => <circle key={d.key} class={`ap-dot ${d.cls ?? ''}`} cx={d.x} cy={d.y} />)}
              {dots?.map((d) => <circle key={d.key} class={`city-dot ${d.cls ?? ''}`} cx={d.x} cy={d.y} />)}
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}

/** Statische Ausschnittskarte (Land, Trip, Flug) mit gezeichneten Flugbögen. */
export function MiniMap({
  box,
  highlight,
  status,
  arcs,
  airports,
  dots,
  aspect = 2,
  pad = 0.25,
}: {
  box: Box;
  highlight?: string[];
  status?: Record<string, string>;
  arcs?: (MapArc & { delay?: number })[];
  airports?: MapDot[];
  dots?: MapDot[];
  aspect?: number;
  pad?: number;
}) {
  const st = getStatic();
  let [x0, y0, x1, y1] = box;
  // Mindestausschnitt, damit auch Kleinstaaten Umgebung zeigen
  let bw = Math.max(x1 - x0, 16);
  let bh = Math.max(y1 - y0, 10);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  bw *= 1 + pad * 2;
  bh *= 1 + pad * 2;
  if (bw / bh > aspect) bh = bw / aspect;
  else bw = bh * aspect;
  x0 = cx - bw / 2;
  y0 = cy - bh / 2;
  const k = 380 / bw; // Bildschirmpixel pro Karteneinheit (ungefähr)
  const hl = new Set(highlight ?? []);
  return (
    <div class="mini" style={{ aspectRatio: String(aspect) }}>
      <svg viewBox={`${x0} ${y0} ${bw} ${bh}`} preserveAspectRatio="xMidYMid slice" style={{ '--k': String(k), '--sw': String(1.9 / k) }}>
        {st.world.countries.map((m) => (m.d ? <path class={`cty ${(m.c && status?.[m.c]) || ''}`} d={m.d} /> : null))}
        {/* hervorgehobene Länder obenauf, mit heller Kontur */}
        {st.world.countries.filter((m) => m.d && m.c && hl.has(m.c)).map((m) => (
          <path class="cty hl" d={m.d} />
        ))}
        {hl.size === 1 &&
          st.world.countries
            .filter((m) => m.s && m.c && hl.has(m.c))
            .map((m) => <circle class="hl-ring" cx={m.p[0]} cy={m.p[1]} />)}
        {arcs?.map((a, i) => (
          <path
            key={a.key}
            class={`arc draw ${a.cls ?? ''}`}
            d={a.d}
            pathLength={1}
            style={{ vectorEffect: 'none', strokeWidth: 'var(--sw)', '--len': '1', '--delay': `${a.delay ?? i * 140}ms` }}
          />
        ))}
        {airports?.map((d) => <circle key={d.key} class={`ap-dot ${d.cls ?? ''}`} cx={d.x} cy={d.y} />)}
        {dots?.map((d) => <circle key={d.key} class={`city-dot ${d.cls ?? ''}`} cx={d.x} cy={d.y} />)}
      </svg>
    </div>
  );
}

export function boxOfPoints(pts: [number, number][]): Box | null {
  if (!pts.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

export function unionBox(boxes: (Box | null | undefined)[]): Box | null {
  const b = boxes.filter(Boolean) as Box[];
  if (!b.length) return null;
  return [Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))];
}
