// Interaktive Weltkarte auf <canvas>.
// Statt ~240 SVG-Pfade bei jedem Zoomschritt neu aufzubauen, wird jedes Bild direkt gemalt:
// flüssiges Zoomen, Hover mit der Maus, weiche Farbwechsel und langes Drücken für neue Orte.
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import { getStatic } from '../lib/geo';
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
  /** onlyIn: nur hineinzoomen, nie hinaus (z. B. Land antippen im Städte-Modus). */
  fitBox: (box: Box | null, animate?: boolean, onlyIn?: boolean) => void;
  /** Kurzer, ruhiger Ring um eine Stadt (z. B. nach dem Hinzufügen). */
  pulse: (cityId: number) => void;
}
/**
 * Städte-Ebene: alle wählbaren Städte, nach Wichtigkeit sortiert (besuchte zuerst, dann nach Grösse).
 * Beim Malen werden sie je nach Zoom ausgedünnt, damit nichts überlappt.
 */
export interface CityLayer {
  n: number;
  x: Float32Array; // Kartenkoordinaten
  y: Float32Array;
  id: Float64Array;
  flags: Uint8Array; // 1 = besucht, 2 = Hauptstadt
  label: (i: number) => string;
}
export interface MapPress {
  lon: number;
  lat: number;
  code: string | null;
}

interface Props {
  status: Record<string, string>; // code -> 'v' | 'w'
  selected?: string | null;
  dots?: MapDot[];
  arcs?: MapArc[];
  airports?: MapDot[];
  cities?: CityLayer | null;
  onCountry?: (code: string | null) => void;
  onCity?: (id: number) => void;
  onLongPress?: (p: MapPress) => void;
  initialBox?: Box | null;
  apiRef?: (api: MapApi) => void;
  padTop?: number;
  padBottom?: number;
}

// ---------- Geometrie (einmal pro App-Start) ----------
interface Geo {
  c: string | null;
  src: [string, string, string]; // Pfade grob, mittel, fein
  lod: (Path2D | null | undefined)[];
  path: Path2D | null; // fein (für Treffer)
  bb: Box;
  small: boolean;
  p: [number, number];
}
/** Pfad in der passenden Detailstufe, erst bei Bedarf erzeugt. */
const pathAt = (g: Geo, level: number): Path2D | null => {
  let p = g.lod[level];
  if (p === undefined) {
    const s = g.src[level] || g.src[2];
    p = g.lod[level] = s ? new Path2D(s) : null;
  }
  return p;
};
let geoCache: Geo[] | null = null;
/** Länder mit Ausschnitt und Pfaden aller Detailstufen (einmal berechnet, überall genutzt). */
export const countryGeometry = () => geometry();
function geometry(): Geo[] {
  if (geoCache) return geoCache;
  geoCache = getStatic().world.countries.map((m) => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    if (m.d) {
      const nums = m.d.match(/-?\d+(?:\.\d+)?/g) ?? [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = +nums[i];
        const y = +nums[i + 1];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    } else [x0, y0, x1, y1] = [m.p[0], m.p[1], m.p[0], m.p[1]];
    const g: Geo = { c: m.c, src: [m.l ?? '', m.m ?? '', m.d], lod: [], path: null, bb: [x0, y0, x1, y1], small: !!m.s, p: m.p };
    g.path = pathAt(g, 2);
    return g;
  });
  return geoCache;
}

// ---------- Farben aus den CSS-Variablen (Hell/Dunkel) ----------
type RGB = [number, number, number];
function parseColor(s: string): RGB {
  const v = s.trim();
  if (v.startsWith('#')) {
    const h = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join('') : v.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = v.match(/\d+(\.\d+)?/g);
  return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

interface Palette {
  land: RGB;
  visited: RGB;
  visitedHi: RGB;
  wish: RGB;
  wishDot: RGB;
  border: RGB;
  text: RGB;
  dot: RGB;
  dotStroke: RGB;
  small: RGB;
  cityFill: RGB;
  cityOn: RGB; // besuchte Stadt im Städte-Modus
  cityOnRing: RGB;
  light: boolean;
}

const TAU = Math.PI * 2;
const MAX_CITIES = 900; // höchstens so viele Punkte pro Bild
const LABEL_FONT = '600 11.5px "Inter Variable", Inter, system-ui, sans-serif';
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => parseColor(cs.getPropertyValue(n));
  const light = document.documentElement.dataset.theme === 'light';
  const land = v('--land');
  const text = v('--text');
  return {
    land,
    visited: v('--visited'),
    visitedHi: v('--visited-hi'),
    wish: v('--wish-map'),
    wishDot: v('--wish'),
    border: light ? [255, 255, 255] : v('--bg'),
    text,
    dot: v('--dot'),
    dotStroke: v('--dot-stroke'),
    small: mix(land, text, 0.28),
    cityFill: light ? [255, 255, 255] : mix(v('--bg'), land, 0.45),
    cityOn: light ? [14, 64, 150] : v('--dot'),
    cityOnRing: light ? [255, 255, 255] : v('--dot-stroke'),
    light,
  };
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export function WorldMap({ status, selected, dots, arcs, airports, cities, onCountry, onCity, onLongPress, initialBox, apiRef, padTop = 20, padBottom = 20 }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const S = useRef({
    w: 0,
    h: 0,
    dpr: 1,
    t: zoomIdentity as ZoomTransform,
    pal: null as Palette | null,
    status: {} as Record<string, string>,
    shown: new Map<string, RGB>(), // aktuell angezeigte Farbe pro Land
    anim: new Map<string, { from: RGB; to: RGB; t0: number }>(),
    sel: null as string | null,
    selT0: 0,
    hover: null as string | null,
    dots: [] as MapDot[],
    arcs: [] as { key: string | number; path: Path2D; cls?: string }[],
    airports: [] as MapDot[],
    city: null as CityLayer | null,
    // im letzten Bild gezeichnete Städte (Bildschirmkoordinaten) – für Treffer und Beschriftung
    pl: { x: new Float32Array(MAX_CITIES), y: new Float32Array(MAX_CITIES), lx: new Float32Array(MAX_CITIES), i: new Int32Array(MAX_CITIES), n: 0 },
    grid: new Int32Array(0),
    labelW: new Map<number, number>(),
    pulse: null as { id: number; t0: number } | null,
    raf: 0,
    zoom: null as ZoomBehavior<HTMLDivElement, unknown> | null,
    animating: 0,
    started: false,
  }).current;
  const props = useRef({ onCountry, onCity, onLongPress, padTop, padBottom, initialBox });
  props.current = { onCountry, onCity, onLongPress, padTop, padBottom, initialBox };
  const hitCtx = useRef<CanvasRenderingContext2D | null>(null);

  const target = (code: string | null): RGB => {
    const p = S.pal!;
    const s = code ? S.status[code] : undefined;
    return s === 'v' ? p.visited : s === 'w' ? p.wish : p.land;
  };

  const colorOf = (code: string | null, now: number): RGB => {
    if (!code) return S.pal!.land;
    const a = S.anim.get(code);
    if (a) {
      const k = (now - a.t0) / 450;
      if (k >= 1) {
        S.anim.delete(code);
        S.shown.set(code, a.to);
        return a.to;
      }
      return mix(a.from, a.to, ease(k));
    }
    return S.shown.get(code) ?? target(code);
  };

  const draw = (now: number) => {
    S.raf = 0;
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !S.w || !S.pal) return;
    const { t, dpr, w, h, pal } = S;
    const geo = geometry();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    const lw = 1 / t.k;
    const vx0 = -t.x / t.k;
    const vy0 = -t.y / t.k;
    const vx1 = (w - t.x) / t.k;
    const vy1 = (h - t.y) / t.k;
    const visible = (b: Box) => b[2] >= vx0 && b[0] <= vx1 && b[3] >= vy0 && b[1] <= vy1;
    const selK = S.sel ? ease((now - S.selT0) / 240) : 0;
    // Detailstufe nach Zoom: Welt grob, Kontinente mittel, nah fein
    const rel = t.k / (w / getStatic().world.w);
    const level = rel < 2.4 ? 0 : rel < 7 ? 1 : 2;

    // Länderflächen
    for (const g of geo) {
      if (!g.path || !visible(g.bb)) continue;
      const gp = pathAt(g, level);
      if (!gp) continue;
      let c = colorOf(g.c, now);
      if (g.c && g.c === S.sel) c = mix(c, S.status[g.c] ? pal.visitedHi : pal.text, (S.status[g.c] ? 0.55 : 0.18) * selK);
      else if (g.c && g.c === S.hover) c = mix(c, pal.text, pal.light ? 0.1 : 0.12);
      ctx.fillStyle = css(c);
      ctx.fill(gp);
    }
    // Grenzen
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.7 * lw;
    ctx.strokeStyle = css(pal.border);
    for (const g of geo) {
      if (!g.path || !visible(g.bb)) continue;
      const gp = pathAt(g, level);
      if (gp) ctx.stroke(gp);
    }
    // Auswahl
    if (S.sel) {
      const g = geo.find((x) => x.c === S.sel && x.path);
      const gp = g && pathAt(g, level);
      if (gp) {
        ctx.lineWidth = 1.8 * lw;
        ctx.strokeStyle = css(pal.text, 0.9 * selK);
        ctx.stroke(gp);
      }
    }
    // Kleinstaaten als Punkte
    for (const g of geo) {
      if (!g.small || !g.c || !visible([g.p[0] - 1, g.p[1] - 1, g.p[0] + 1, g.p[1] + 1])) continue;
      const s = S.status[g.c];
      ctx.beginPath();
      ctx.arc(g.p[0], g.p[1], (g.c === S.sel ? 4 : 2.6) * lw, 0, Math.PI * 2);
      ctx.fillStyle = css(s === 'v' ? pal.visitedHi : s === 'w' ? pal.wishDot : pal.small);
      ctx.fill();
      ctx.lineWidth = (g.c === S.sel ? 1.6 : 1) * lw;
      ctx.strokeStyle = g.c === S.sel ? css(pal.text) : css(pal.border);
      ctx.stroke();
    }
    // Flugbögen
    if (S.arcs.length) {
      ctx.lineCap = 'round';
      for (const a of S.arcs) {
        ctx.lineWidth = (a.cls === 'faint' ? 1.1 : 1.7) * lw;
        ctx.strokeStyle = a.cls === 'ground' ? css(pal.wishDot, 0.9) : css(pal.visitedHi, 0.85);
        ctx.setLineDash(a.cls === 'ground' ? [3 * lw, 4 * lw] : []);
        ctx.stroke(a.path);
      }
      ctx.setLineDash([]);
    }
    // Flughäfen
    for (const d of S.airports) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, (d.cls === 'hub' ? 5 : 3.6) * lw, 0, Math.PI * 2);
      ctx.fillStyle = d.cls === 'hub' ? css(pal.visitedHi) : css(pal.border);
      ctx.fill();
      ctx.lineWidth = 1.8 * lw;
      ctx.strokeStyle = css(pal.visitedHi);
      ctx.stroke();
    }
    // Städte
    if (S.city) drawCities(ctx, now, rel);
    else
      for (const d of S.dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 3.4 * lw, 0, TAU);
        ctx.fillStyle = css(pal.dot);
        ctx.fill();
        ctx.lineWidth = 1.5 * lw;
        ctx.strokeStyle = css(pal.dotStroke);
        ctx.stroke();
      }
    if (S.anim.size || S.pulse || (S.sel && now - S.selT0 < 260)) S.raf = requestAnimationFrame(draw);
  };

  /**
   * Städte-Ebene in Bildschirmkoordinaten. In einem Durchgang nach Wichtigkeit:
   * Punkt nur mit genug Abstand setzen, den Namen gleich mitplatzieren – so bekommen die grossen
   * Städte ihre Beschriftung, und kleinere Punkte weichen den Namen aus.
   */
  const drawCities = (ctx: CanvasRenderingContext2D, now: number, rel: number) => {
    const L = S.city!;
    const { t, w, h, dpr, pal, pl: P } = S;
    if (!pal) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = LABEL_FONT;
    const minD = rel < 1.6 ? 26 : rel < 3.5 ? 22 : rel < 8 ? 19 : 17;
    const maxLabels = rel < 1.6 ? 14 : rel < 3.5 ? 28 : 44;
    const sc = rel < 1.6 ? 0.85 : 1;
    const cell = minD;
    const cols = Math.ceil(w / cell) + 3;
    const rows = Math.ceil(h / cell) + 3;
    if (S.grid.length < cols * rows) S.grid = new Int32Array(cols * rows);
    const grid = S.grid;
    grid.fill(-1, 0, cols * rows);
    const min2 = minD * minD;
    const boxes: number[] = []; // Namen als [x0, y0, x1, y1]

    const inLabel = (x: number, y: number, pad: number) => {
      for (let b = 0; b < boxes.length; b += 4) if (x > boxes[b] - pad && x < boxes[b + 2] + pad && y > boxes[b + 1] - pad && y < boxes[b + 3] + pad) return true;
      return false;
    };
    const labelHits = (x0: number, y0: number, x1: number, y1: number) => {
      for (let b = 0; b < boxes.length; b += 4) if (x0 < boxes[b + 2] + 4 && x1 > boxes[b] - 4 && y0 < boxes[b + 3] + 1 && y1 > boxes[b + 1] - 1) return true;
      return false;
    };
    const dotHits = (x0: number, y0: number, x1: number, y1: number, self: number) => {
      const c0 = Math.max(0, Math.floor((x0 + 4) / cell));
      const c1 = Math.min(cols - 1, Math.floor((x1 + 12) / cell));
      const r0 = Math.max(0, Math.floor((y0 + 4) / cell));
      const r1 = Math.min(rows - 1, Math.floor((y1 + 12) / cell));
      for (let yy = r0; yy <= r1; yy++)
        for (let xx = c0; xx <= c1; xx++) {
          const j = grid[yy * cols + xx];
          if (j < 0 || j === self) continue;
          if (P.x[j] > x0 - 5 && P.x[j] < x1 + 5 && P.y[j] > y0 - 4 && P.y[j] < y1 + 4) return true;
        }
      return false;
    };

    let n = 0;
    let labels = 0;
    for (let i = 0; i < L.n && n < MAX_CITIES; i++) {
      const sx = L.x[i] * t.k + t.x;
      const sy = L.y[i] * t.k + t.y;
      if (sx < -8 || sx > w + 8 || sy < -8 || sy > h + 8) continue;
      const gx = Math.floor((sx + 8) / cell);
      const gy = Math.floor((sy + 8) / cell);
      const f = L.flags[i];
      // Besuchte immer zeigen, alle anderen nur mit genug Abstand und nicht auf einem Namen
      if (!(f & 1)) {
        let blocked = false;
        for (let yy = Math.max(0, gy - 1); yy <= Math.min(rows - 1, gy + 1) && !blocked; yy++)
          for (let xx = Math.max(0, gx - 1); xx <= Math.min(cols - 1, gx + 1); xx++) {
            const j = grid[yy * cols + xx];
            if (j < 0) continue;
            const dx = P.x[j] - sx;
            const dy = P.y[j] - sy;
            if (dx * dx + dy * dy < min2) {
              blocked = true;
              break;
            }
          }
        if (blocked || (boxes.length && inLabel(sx, sy, 6))) continue;
      }
      grid[gy * cols + gx] = n;
      P.x[n] = sx;
      P.y[n] = sy;
      P.i[n] = i;
      P.lx[n] = NaN;
      if (labels < maxLabels && sx > 0 && sx < w && sy > 0 && sy < h) {
        const text = L.label(i);
        let tw = S.labelW.get(i);
        if (tw === undefined) {
          tw = text ? ctx.measureText(text).width : 0;
          S.labelW.set(i, tw);
        }
        if (tw > 0) {
          const gap = (f & 2 ? 9 : 8) * sc;
          const y0 = sy - 7;
          const y1 = sy + 7;
          let x0 = sx + gap;
          if (x0 + tw > w - 4 || labelHits(x0, y0, x0 + tw, y1) || dotHits(x0, y0, x0 + tw, y1, n)) {
            x0 = sx - gap - tw;
            if (x0 < 4 || labelHits(x0, y0, x0 + tw, y1) || dotHits(x0, y0, x0 + tw, y1, n)) x0 = NaN;
          }
          if (!Number.isNaN(x0)) {
            boxes.push(x0, y0, x0 + tw, y1);
            P.lx[n] = x0;
            labels++;
          }
        }
      }
      n++;
    }
    P.n = n;

    // noch nicht besucht: hohl
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const fk = L.flags[P.i[k]];
      if (fk & 1) continue;
      const r = (fk & 2 ? 4.6 : 3.7) * sc;
      ctx.moveTo(P.x[k] + r, P.y[k]);
      ctx.arc(P.x[k], P.y[k], r, 0, TAU);
    }
    ctx.fillStyle = css(pal.cityFill);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = css(pal.text, pal.light ? 0.6 : 0.88);
    ctx.stroke();
    // besucht: gefüllt wie bisher
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const fk = L.flags[P.i[k]];
      if (!(fk & 1)) continue;
      const r = (fk & 2 ? 5 : 4.2) * sc;
      ctx.moveTo(P.x[k] + r, P.y[k]);
      ctx.arc(P.x[k], P.y[k], r, 0, TAU);
    }
    ctx.fillStyle = css(pal.cityOn);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(pal.cityOnRing);
    ctx.stroke();

    // Namen mit Lichthof, damit sie auf jeder Fläche lesbar sind
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    const halo = css(pal.border, 0.9);
    const ink = css(pal.text);
    const inkSoft = css(pal.text, 0.78);
    for (let k = 0; k < n; k++) {
      if (Number.isNaN(P.lx[k])) continue;
      const i = P.i[k];
      const text = L.label(i);
      ctx.strokeStyle = halo;
      ctx.strokeText(text, P.lx[k], P.y[k]);
      ctx.fillStyle = L.flags[i] & 1 ? ink : inkSoft;
      ctx.fillText(text, P.lx[k], P.y[k]);
    }

    // ruhiger Ring nach dem Hinzufügen
    if (S.pulse) {
      const e = (now - S.pulse.t0) / 560;
      if (e >= 1) S.pulse = null;
      else
        for (let k = 0; k < n; k++)
          if (L.id[P.i[k]] === S.pulse.id) {
            ctx.beginPath();
            ctx.arc(P.x[k], P.y[k], 5 + 13 * ease(e), 0, TAU);
            ctx.lineWidth = 2;
            ctx.strokeStyle = css(pal.visitedHi, 0.75 * (1 - e));
            ctx.stroke();
            break;
          }
    }
  };

  /** Nächste gezeichnete Stadt am Bildschirmpunkt (oder null). */
  const cityAt = (px: number, py: number, radius: number): number | null => {
    const P = S.pl;
    if (!S.city) return null;
    let best = -1;
    let bestD = radius * radius;
    for (let k = 0; k < P.n; k++) {
      const dx = P.x[k] - px;
      const dy = P.y[k] - py;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = k;
      }
    }
    return best < 0 ? null : S.city.id[P.i[best]];
  };
  const redraw = () => {
    if (!S.raf) S.raf = requestAnimationFrame(draw);
  };

  // ---------- Grösse ----------
  useLayoutEffect(() => {
    const el = root.current!;
    S.pal = readPalette();
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const changed = r.width !== S.w || r.height !== S.h || dpr !== S.dpr;
      if (!changed) return;
      S.w = r.width;
      S.h = r.height;
      S.dpr = dpr;
      const cv = canvas.current!;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      setupZoom();
      redraw();
    });
    ro.observe(el);
    // Hell/Dunkel: Farben neu lesen und sofort neu malen (auch für den Kreis-Übergang)
    const mo = new MutationObserver(() => {
      S.pal = readPalette();
      S.shown.clear();
      S.anim.clear();
      if (S.raf) cancelAnimationFrame(S.raf);
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(S.raf);
    };
  }, []);

  // ---------- Zoom ----------
  const boxTransform = (box: Box | null): ZoomTransform => {
    const st = getStatic();
    const { w, h } = S;
    const b: Box = box ?? [0, 0, st.world.w, st.world.h];
    const bw = Math.max(b[2] - b[0], 8);
    const bh = Math.max(b[3] - b[1], 8);
    const { padTop: pt, padBottom: pb } = props.current;
    const availH = h - pt - pb;
    const kMin = (w / st.world.w) * 0.85;
    const k = Math.max(kMin, Math.min((w - 40) / bw, (availH - 20) / bh, (w / st.world.w) * 60));
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    return zoomIdentity.translate(w / 2 - k * cx, pt + availH / 2 - k * cy).scale(k);
  };

  const setupZoom = () => {
    const el = root.current!;
    const st = getStatic();
    const kWorld = S.w / st.world.w;
    const sel = select(el);
    const z = (S.zoom ??= d3zoom<HTMLDivElement, unknown>()
      .clickDistance(6)
      .on('zoom', (e) => {
        S.t = e.transform;
        cancelLongPress();
        redraw();
      }));
    z.scaleExtent([kWorld * 0.85, kWorld * 60])
      .translateExtent([
        [-st.world.w * 0.15, -st.world.h * 0.4],
        [st.world.w * 1.15, st.world.h * 1.4],
      ])
      .extent([
        [0, 0],
        [S.w, S.h],
      ]);
    sel.call(z).on('dblclick.zoom', null);
    const start = S.started ? S.t : boxTransform(props.current.initialBox ?? null);
    S.started = true;
    z.transform(sel, start);
  };

  const fitBox = (box: Box | null, animate = true, onlyIn = false) => {
    if (!S.w || !S.zoom || !root.current) return;
    const sel = select(root.current);
    const to = boxTransform(box);
    if (onlyIn && to.k <= S.t.k * 1.15) return;
    if (!animate || reducedMotion()) {
      S.zoom.transform(sel, to);
      return;
    }
    const from = S.t;
    const { w, h } = S;
    const ip = interpolateZoom([(w / 2 - from.x) / from.k, (h / 2 - from.y) / from.k, w / from.k], [(w / 2 - to.x) / to.k, (h / 2 - to.y) / to.k, w / to.k]);
    const dur = Math.min(1100, Math.max(520, ip.duration * 0.55));
    const id = ++S.animating;
    const t0 = performance.now();
    const step = (now: number) => {
      if (S.animating !== id) return;
      const p = Math.min(1, (now - t0) / dur);
      const [cx, cy, vw] = ip(1 - Math.pow(1 - p, 3.2));
      const k = w / vw;
      S.zoom!.transform(sel, zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  useEffect(() => {
    apiRef?.({
      fitBox,
      pulse: (id) => {
        S.pulse = { id, t0: performance.now() };
        redraw();
      },
    });
  });

  // ---------- Daten -> Zustand ----------
  useEffect(() => {
    if (!S.pal) S.pal = readPalette();
    const now = performance.now();
    const before = S.status;
    const keys = new Set([...Object.keys(before), ...Object.keys(status)]);
    S.status = status;
    if (S.started) {
      for (const k of keys) {
        if (before[k] === status[k]) continue;
        const from = colorOf(k, now);
        S.anim.set(k, { from, to: target(k), t0: now });
      }
    }
    redraw();
  }, [status]);

  useEffect(() => {
    if (selected !== S.sel) {
      S.sel = selected ?? null;
      S.selT0 = performance.now();
      redraw();
    }
  }, [selected]);

  useEffect(() => {
    S.city = cities ?? null;
    S.labelW.clear();
    if (!S.city) S.pl.n = 0;
    redraw();
  }, [cities]);

  useEffect(() => {
    S.dots = dots ?? [];
    S.airports = airports ?? [];
    S.arcs = (arcs ?? []).map((a) => ({ key: a.key, path: new Path2D(a.d), cls: a.cls }));
    redraw();
  }, [dots, arcs, airports]);

  // ---------- Treffer ----------
  const toMap = (clientX: number, clientY: number): [number, number] => {
    const r = root.current!.getBoundingClientRect();
    return S.t.invert([clientX - r.left, clientY - r.top]) as [number, number];
  };
  const hitTest = (mx: number, my: number): string | null => {
    const geo = geometry();
    const k = S.t.k;
    for (const g of geo) if (g.small && g.c && Math.hypot(g.p[0] - mx, g.p[1] - my) * k <= 9) return g.c;
    hitCtx.current ??= document.createElement('canvas').getContext('2d');
    const hc = hitCtx.current!;
    for (const g of geo) {
      if (!g.path || !g.c) continue;
      if (mx < g.bb[0] || mx > g.bb[2] || my < g.bb[1] || my > g.bb[3]) continue;
      if (hc.isPointInPath(g.path, mx, my)) return g.c;
    }
    return null;
  };

  // ---------- Tippen, Hover, langes Drücken ----------
  const lp = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const hoverAt = useRef<[number, number]>([0, 0]);
  const hoverRaf = useRef(0);
  const cancelLongPress = () => {
    if (lp.current) clearTimeout(lp.current.timer);
    lp.current = lp.current?.fired ? lp.current : null;
  };
  const firePress = (clientX: number, clientY: number) => {
    const [mx, my] = toMap(clientX, clientY);
    const ll = getStatic().projection.invert?.([mx, my]);
    if (!ll) return;
    navigator.vibrate?.(12);
    props.current.onLongPress?.({ lon: ll[0], lat: ll[1], code: hitTest(mx, my) });
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!props.current.onLongPress || e.button !== 0 || e.pointerType === 'mouse') return;
    const x = e.clientX;
    const y = e.clientY;
    lp.current = {
      x,
      y,
      fired: false,
      timer: window.setTimeout(() => {
        if (!lp.current) return;
        lp.current.fired = true;
        firePress(x, y);
      }, 520),
    };
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = lp.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
      clearTimeout(p.timer);
      lp.current = null;
    }
    if (e.pointerType !== 'mouse' || e.buttons) return;
    hoverAt.current = [e.clientX, e.clientY];
    if (hoverRaf.current) return;
    hoverRaf.current = requestAnimationFrame(() => {
      hoverRaf.current = 0;
      const r = root.current!.getBoundingClientRect();
      const overCity = cityAt(hoverAt.current[0] - r.left, hoverAt.current[1] - r.top, 10) !== null;
      root.current?.classList.toggle('over-city', overCity);
      const [mx, my] = toMap(hoverAt.current[0], hoverAt.current[1]);
      const code = overCity ? null : hitTest(mx, my);
      if (code !== S.hover) {
        S.hover = code;
        root.current?.classList.toggle('over-country', !!code);
        redraw();
      }
    });
  };
  const onPointerUp = () => {
    if (lp.current && !lp.current.fired) {
      clearTimeout(lp.current.timer);
      lp.current = null;
    }
  };
  const onLeave = () => {
    onPointerUp();
    if (S.hover) {
      S.hover = null;
      root.current?.classList.remove('over-country');
      redraw();
    }
  };
  const onClick = (e: MouseEvent) => {
    if (lp.current?.fired) {
      lp.current = null;
      return;
    }
    // Städte-Modus: Punkt antippen (grosszügige Trefferfläche für Finger)
    if (S.city && props.current.onCity) {
      const r = root.current!.getBoundingClientRect();
      const id = cityAt(e.clientX - r.left, e.clientY - r.top, (e as PointerEvent).pointerType === 'mouse' ? 12 : 22);
      if (id !== null) {
        props.current.onCity(id);
        return;
      }
    }
    const [mx, my] = toMap(e.clientX, e.clientY);
    props.current.onCountry?.(hitTest(mx, my));
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Rechtsklick (Maus) = langes Drücken
    if ((e as PointerEvent).pointerType !== 'touch' && !lp.current?.fired && props.current.onLongPress) firePress(e.clientX, e.clientY);
  };

  return (
    <div
      class="map-root"
      ref={root}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onLeave}
      onContextMenu={onContextMenu}
    >
      <canvas ref={canvas} class="map-canvas" role="img" aria-label="Weltkarte" />
    </div>
  );
}
