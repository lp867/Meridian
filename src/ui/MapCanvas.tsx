// Interaktive Weltkarte auf <canvas>.
// Statt ~240 SVG-Pfade bei jedem Zoomschritt neu aufzubauen, wird jedes Bild direkt gemalt:
// flüssiges Zoomen, Hover mit der Maus, weiche Farbwechsel und langes Drücken für neue Orte.
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { interpolateZoom } from 'd3-interpolate';
import { getStatic } from '../lib/geo';
import { reducedMotion } from '../lib/spring';
import { TileLayer, type TileSource } from './tiles';

export type Box = [number, number, number, number];
export interface MapDot {
  key: string | number;
  x: number;
  y: number;
  cls?: string;
  label?: string; // Name im Hinweis beim Darüberfahren
  sub?: string;
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
  /** Ruhig um die Bildmitte zoomen (Faktor 2 = hinein, 0.5 = hinaus). */
  zoomBy: (factor: number) => void;
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
  sub?: (i: number) => string; // Zusatz im Hinweis beim Darüberfahren
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
  /** Kartenbilder unter den Ländern (Gelände/Satellit); ohne = schlichte Karte */
  tiles?: TileSource | null;
  /** «Du bist hier» (Kartenkoordinaten) */
  me?: { x: number; y: number } | null;
  onCountry?: (code: string | null) => void;
  onCity?: (id: number) => void;
  onLongPress?: (p: MapPress) => void;
  /** Meldet, ob ganz hinaus- bzw. hineingezoomt ist (für die Zoom-Knöpfe). */
  onScale?: (atMin: boolean, atMax: boolean) => void;
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
// Versatz für den Lichthof um die Namen (8 Richtungen)
const HALO = [-1.2, 0, 1.2, 0, 0, -1.2, 0, 1.2, -0.9, -0.9, 0.9, 0.9, -0.9, 0.9, 0.9, -0.9];
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

export function WorldMap({ status, selected, dots, arcs, airports, cities, tiles, me, onCountry, onCity, onLongPress, onScale, initialBox, apiRef, padTop = 20, padBottom = 20 }: Props) {
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
    tileLayer: null as TileLayer | null,
    me: null as { x: number; y: number } | null,
    zoomTo: 0, // Ziel-Zoom der Knöpfe (mehrmals schnell klicken summiert sich)
    scaleState: '',
    pulse: null as { id: number; t0: number } | null,
    raf: 0,
    zoom: null as ZoomBehavior<HTMLDivElement, unknown> | null,
    animating: 0,
    started: false,
  }).current;
  const props = useRef({ onCountry, onCity, onLongPress, onScale, padTop, padBottom, initialBox });
  props.current = { onCountry, onCity, onLongPress, onScale, padTop, padBottom, initialBox };
  const tip = useRef<HTMLDivElement>(null);
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

    const tl = S.tileLayer;
    if (tl) {
      tl.draw(ctx, getStatic().projection, t, w, h, dpr);
      ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    }
    // Ganz nah soll das Bild klar bleiben: Einfärbung der Länder wird dann schwächer
    const tint = !tl || rel <= 6 ? 1 : rel >= 80 ? 0.25 : 1 - 0.75 * (Math.log(rel / 6) / Math.log(80 / 6));
    // Länderflächen
    for (const g of geo) {
      if (!g.path || !visible(g.bb)) continue;
      const gp = pathAt(g, level);
      if (!gp) continue;
      if (tl) {
        // über dem Bild: nur besuchte und gewünschte Länder durchscheinend einfärben
        const st = g.c ? S.status[g.c] : undefined;
        const isSel = !!g.c && g.c === S.sel;
        const isHov = !!g.c && g.c === S.hover;
        let alpha = st ? 0.42 : 0;
        if (isSel) alpha = st ? 0.42 + 0.2 * selK : 0.2 * selK;
        else if (isHov) alpha = st ? 0.52 : 0.14;
        alpha *= tint;
        if (alpha <= 0.01) continue;
        ctx.fillStyle = css(st ? colorOf(g.c, now) : tl.src.light ? [255, 255, 255] : pal.text, alpha);
        ctx.fill(gp);
        continue;
      }
      let c = colorOf(g.c, now);
      if (g.c && g.c === S.sel) c = mix(c, S.status[g.c] ? pal.visitedHi : pal.text, (S.status[g.c] ? 0.55 : 0.18) * selK);
      else if (g.c && g.c === S.hover) c = mix(c, pal.text, pal.light ? 0.1 : 0.12);
      ctx.fillStyle = css(c);
      ctx.fill(gp);
    }
    // Grenzen: genau ein Bildschirmpixel breit. So nutzt der Browser den schnellen Haarlinien-Weg –
    // rund dreimal schneller als dickere Linien, das war die Hauptursache fürs Ruckeln beim Zoomen.
    ctx.lineJoin = 'miter';
    ctx.lineWidth = 1 / (dpr * t.k);
    ctx.strokeStyle = tl ? (tl.src.light ? 'rgba(40,48,62,0.5)' : 'rgba(255,255,255,0.55)') : css(pal.border);
    for (const g of geo) {
      if (!g.path || !visible(g.bb)) continue;
      const gp = pathAt(g, level);
      if (gp) ctx.stroke(gp);
    }
    // Auswahl
    ctx.lineJoin = 'round';
    if (S.sel) {
      const g = geo.find((x) => x.c === S.sel && x.path);
      const gp = g && pathAt(g, level);
      if (gp) {
        ctx.lineWidth = 1.8 * lw;
        ctx.strokeStyle = tl ? (tl.src.light ? css([20, 28, 40], 0.9 * selK) : css([255, 255, 255], 0.95 * selK)) : css(pal.text, 0.9 * selK);
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
    // Du bist hier: blauer Punkt mit weissem Rand und weichem Hof
    if (S.me) {
      const mx = S.me.x * t.k + t.x;
      const my = S.me.y * t.k + t.y;
      if (mx > -20 && mx < w + 20 && my > -20 && my < h + 20) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.arc(mx, my, 17, 0, TAU);
        ctx.fillStyle = 'rgba(26,115,232,0.16)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, 5.6, 0, TAU);
        ctx.fillStyle = '#1a73e8';
        ctx.fill();
      }
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

    // Punkte als zwei Flächen (Ring, dann Füllung) – Flächen sind deutlich günstiger als Konturen
    const dots = (on: number, rOf: (f: number) => number, ring: number, ringColor: string, fillColor: string) => {
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const fk = L.flags[P.i[k]];
          if ((fk & 1) !== on) continue;
          const r = rOf(fk) + (pass ? -ring / 2 : ring / 2);
          ctx.moveTo(P.x[k] + r, P.y[k]);
          ctx.arc(P.x[k], P.y[k], r, 0, TAU);
        }
        ctx.fillStyle = pass ? fillColor : ringColor;
        ctx.fill();
      }
    };
    dots(0, (fk) => (fk & 2 ? 4.6 : 3.7) * sc, 1.8, css(pal.text, pal.light ? 0.6 : 0.88), css(pal.cityFill));
    dots(1, (fk) => (fk & 2 ? 5 : 4.2) * sc, 2, css(pal.cityOnRing), css(pal.cityOn));

    // Namen mit Lichthof: Text leicht versetzt in Hintergrundfarbe, darüber die Schrift
    // (Schrift-Füllungen kommen aus dem Glyphen-Speicher und sind viel schneller als Schrift-Konturen)
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = css(pal.border, 0.85);
    for (let k = 0; k < n; k++) {
      if (Number.isNaN(P.lx[k])) continue;
      const text = L.label(P.i[k]);
      const x = P.lx[k];
      const y = P.y[k];
      for (let o = 0; o < HALO.length; o += 2) ctx.fillText(text, x + HALO[o], y + HALO[o + 1]);
    }
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? css(pal.text) : css(pal.text, 0.78);
      for (let k = 0; k < n; k++) {
        if (Number.isNaN(P.lx[k]) || (L.flags[P.i[k]] & 1) !== pass) continue;
        ctx.fillText(L.label(P.i[k]), P.lx[k], P.y[k]);
      }
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

  /** Nächste gezeichnete Stadt am Bildschirmpunkt (Index im letzten Bild oder -1). */
  const cityHit = (px: number, py: number, radius: number): number => {
    const P = S.pl;
    if (!S.city) return -1;
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
    return best;
  };
  const cityAt = (px: number, py: number, radius: number): number | null => {
    const k = cityHit(px, py, radius);
    return k < 0 || !S.city ? null : S.city.id[S.pl.i[k]];
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

  /** Stärkster Zoom: schlichte Karte 400-fach, mit Bildern bis zur feinsten Kachelstufe. */
  const maxK = () => {
    const st = getStatic();
    const kWorld = S.w / st.world.w;
    const src = S.tileLayer?.src;
    if (!src) return kWorld * 400;
    const p0 = st.projection([0, 0])!;
    const p1 = st.projection([1, 0])!;
    const unitsPerDeg = Math.abs(p1[0] - p0[0]);
    const pxPerDeg = (256 * 2 ** (src.maxZoom + 0.6)) / 360 / Math.min(S.dpr, 2);
    return Math.max(kWorld * 400, pxPerDeg / unitsPerDeg);
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
        if (e.sourceEvent) {
          // Hand am Rad oder Finger auf der Karte: Animationen der Knöpfe nicht dagegen laufen lassen
          S.animating++;
          S.zoomTo = 0;
        }
        cancelLongPress();
        hideTip();
        reportScale();
        redraw();
      }));
    z.scaleExtent([kWorld * 0.85, maxK()])
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
    S.scaleState = '';
    reportScale();
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

  const reportScale = () => {
    if (!S.zoom || !props.current.onScale) return;
    const [k0, k1] = S.zoom.scaleExtent();
    const atMin = S.t.k <= k0 * 1.001;
    const atMax = S.t.k >= k1 * 0.999;
    const state = `${atMin}${atMax}`;
    if (state === S.scaleState) return;
    S.scaleState = state;
    props.current.onScale(atMin, atMax);
  };

  const zoomBy = (factor: number) => {
    if (!S.w || !S.zoom || !root.current) return;
    const sel = select(root.current);
    const [k0, k1] = S.zoom.scaleExtent();
    const from = S.t;
    const target = Math.max(k0, Math.min(k1, (S.zoomTo || from.k) * factor));
    if (Math.abs(target - from.k) < 1e-6) return;
    S.zoomTo = target;
    // Mitte des freien Kartenbereichs bleibt stehen
    const { padTop: pt, padBottom: pb } = props.current;
    const cx = S.w / 2;
    const cy = pt + (S.h - pt - pb) / 2;
    const mx = (cx - from.x) / from.k;
    const my = (cy - from.y) / from.k;
    const id = ++S.animating;
    const dur = reducedMotion() ? 0 : 320;
    const t0 = performance.now();
    const step = (now: number) => {
      if (S.animating !== id) return;
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      const k = from.k * Math.pow(target / from.k, 1 - Math.pow(1 - p, 3));
      S.zoom!.transform(sel, zoomIdentity.translate(cx - mx * k, cy - my * k).scale(k));
      if (p < 1) requestAnimationFrame(step);
      else S.zoomTo = 0;
    };
    requestAnimationFrame(step);
  };

  // Tastatur am Laptop: + und - zoomen (nur wenn diese Karte sichtbar ist und kein Feld/Sheet offen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const zoomIn = e.key === '+' || e.key === '=';
      if (!zoomIn && e.key !== '-') return;
      const el = root.current;
      const a = document.activeElement;
      if (!el || !el.closest('.pane.active') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || document.querySelector('.sheet.open')) return;
      e.preventDefault();
      zoomBy(zoomIn ? 2 : 0.5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Schrift fertig geladen: Namen neu vermessen
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    const onDone = () => {
      S.labelW.clear();
      redraw();
    };
    fonts.addEventListener('loadingdone', onDone);
    return () => fonts.removeEventListener('loadingdone', onDone);
  }, []);

  useEffect(() => {
    apiRef?.({
      zoomBy,
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
    S.tileLayer?.dispose();
    S.tileLayer = tiles ? new TileLayer(tiles, redraw) : null;
    if (S.zoom && root.current && S.w) {
      const k1 = maxK();
      S.zoom.scaleExtent([S.zoom.scaleExtent()[0], k1]);
      if (S.t.k > k1) S.zoom.scaleTo(select(root.current), k1);
      S.scaleState = '';
      reportScale();
    }
    redraw();
    return () => {
      S.tileLayer?.dispose();
      S.tileLayer = null;
    };
  }, [tiles]);

  useEffect(() => {
    S.me = me ?? null;
    redraw();
  }, [me]);

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
      const overCity = hoverCity(hoverAt.current[0] - r.left, hoverAt.current[1] - r.top);
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
  const hideTip = () => tip.current?.classList.remove('show');
  const showTip = (x: number, y: number, title: string, sub: string) => {
    const el = tip.current;
    if (!el) return;
    (el.firstChild as HTMLElement).textContent = title;
    (el.lastChild as HTMLElement).textContent = sub;
    (el.lastChild as HTMLElement).style.display = sub ? '' : 'none';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(S.w - w - 8, x - w / 2));
    const above = y - h - 12;
    const top = above < 8 ? y + 14 : above;
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    el.classList.add('show');
  };
  /** Maus über einer Stadt: Name zeigen. Gibt zurück, ob eine Stadt getroffen wurde. */
  const hoverCity = (px: number, py: number): boolean => {
    if (S.city) {
      const k = cityHit(px, py, 10);
      if (k >= 0) {
        const i = S.pl.i[k];
        showTip(S.pl.x[k], S.pl.y[k], S.city.label(i), S.city.sub?.(i) ?? '');
        return true;
      }
    } else {
      const { t } = S;
      let best: MapDot | null = null;
      let bestD = 100;
      for (const d of S.dots) {
        if (!d.label) continue;
        const dx = d.x * t.k + t.x - px;
        const dy = d.y * t.k + t.y - py;
        const dd = dx * dx + dy * dy;
        if (dd <= bestD) {
          bestD = dd;
          best = d;
        }
      }
      if (best) {
        showTip(best.x * t.k + t.x, best.y * t.k + t.y, best.label!, best.sub ?? '');
        return true;
      }
    }
    hideTip();
    return false;
  };
  const onPointerUp = () => {
    if (lp.current && !lp.current.fired) {
      clearTimeout(lp.current.timer);
      lp.current = null;
    }
  };
  const onLeave = () => {
    onPointerUp();
    hideTip();
    root.current?.classList.remove('over-city');
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
      <div class="map-tip" ref={tip} aria-hidden="true">
        <b />
        <span />
      </div>
    </div>
  );
}

/** Land an einer Position (Längen-/Breitengrad) – über die Ländergrenzen der Karte. */
let hitCanvas: CanvasRenderingContext2D | null = null;
export function countryAt(lon: number, lat: number): string | null {
  const p = getStatic().projection([lon, lat]);
  if (!p) return null;
  hitCanvas ??= document.createElement('canvas').getContext('2d');
  for (const g of geometry()) {
    if (!g.path || !g.c) continue;
    if (p[0] < g.bb[0] || p[0] > g.bb[2] || p[1] < g.bb[1] || p[1] > g.bb[3]) continue;
    if (hitCanvas!.isPointInPath(g.path, p[0], p[1])) return g.c;
  }
  return null;
}
