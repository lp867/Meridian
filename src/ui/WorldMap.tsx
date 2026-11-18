// Statische Karten-Ausschnitte (SVG) und Hilfsfunktionen.
// Die interaktive Weltkarte liegt in MapCanvas.tsx.
import { getStatic } from '../lib/geo';
import { countryGeometry, type Box, type MapArc, type MapDot } from './MapCanvas';
export { WorldMap } from './MapCanvas';
export type { Box, CityLayer, MapApi, MapArc, MapDot, MapPress } from './MapCanvas';

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
  // Nur Länder im Ausschnitt zeichnen, in passender Detailstufe (viel kleineres DOM als die ganze Welt)
  const level = bw > 380 ? 0 : bw > 130 ? 1 : 2;
  const visible = countryGeometry().filter((g) => g.c !== undefined && g.bb[2] >= x0 && g.bb[0] <= x0 + bw && g.bb[3] >= y0 && g.bb[1] <= y0 + bh);
  const d = (g: (typeof visible)[number]) => g.src[level] || g.src[2];
  return (
    <div class="mini" style={{ aspectRatio: String(aspect) }}>
      <svg viewBox={`${x0} ${y0} ${bw} ${bh}`} preserveAspectRatio="xMidYMid slice" style={{ '--k': String(k), '--sw': String(1.9 / k) }}>
        {visible.map((g) => (d(g) ? <path class={`cty ${(g.c && status?.[g.c]) || ''}`} d={d(g)} /> : null))}
        {/* hervorgehobene Länder obenauf, mit heller Kontur */}
        {visible.filter((g) => g.c && hl.has(g.c) && d(g)).map((g) => (
          <path class="cty hl" d={d(g)} />
        ))}
        {hl.size === 1 &&
          st.world.countries
            .filter((m) => m.s && m.c && hl.has(m.c))
            .map((m) => <circle class="hl-ring" cx={m.p[0]} cy={m.p[1]} />)}
        {arcs?.map((a) => <path key={a.key} class={`arc ${a.cls ?? ''}`} d={a.d} style={{ vectorEffect: 'none', strokeWidth: 'var(--sw)' }} />)}
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
