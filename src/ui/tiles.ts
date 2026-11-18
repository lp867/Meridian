// Kartenbilder (Gelände, Satellit) unter der Weltkarte.
// Die Kacheln liegen in Web-Mercator vor, die Karte nutzt Natural Earth. Jede Kachel wird deshalb
// in kleine Stücke geteilt und jedes Stück mit einer eigenen Verzerrung an seinen Platz gezeichnet –
// so liegen Grenzen und Städte genau auf dem Bild. Fehlt eine Kachel noch, springt eine gröbere ein.
import type { GeoProjection } from 'd3-geo';
import type { ZoomTransform } from 'd3-zoom';

export interface TileSource {
  id: string;
  url: (z: number, x: number, y: number) => string;
  maxZoom: number;
  /** helles Bild (Gelände) – Grenzen dunkel statt hell */
  light: boolean;
}

const EOX = (layer: string) => (z: number, x: number, y: number) => `https://tiles.maps.eox.at/wmts/1.0.0/${layer}/default/g/${z}/${y}/${x}.jpg`;

export const TILE_SOURCES: Record<'terrain' | 'satellite', TileSource> = {
  terrain: { id: 'terrain', url: EOX('terrain-light_3857'), maxZoom: 16, light: true },
  satellite: { id: 'satellite', url: EOX('s2cloudless_3857'), maxZoom: 14, light: false },
};

interface Entry {
  img: HTMLImageElement;
  state: 0 | 1 | 2; // lädt, fertig, Fehler
  used: number;
}

const MAX_LAT = 85.0511;
const MAX_ENTRIES = 420;
const MAX_LOADING = 12;
const lat2y = (lat: number, n: number) => {
  const r = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
};
const y2lat = (y: number, n: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

export class TileLayer {
  private cache = new Map<string, Entry>();
  private wanted: [number, number, number, number][] = []; // z, x, y, Abstand zur Mitte
  private loading = 0;
  private frame = 0;
  private timer = 0;

  constructor(
    readonly src: TileSource,
    private onLoad: () => void,
  ) {}

  dispose() {
    clearTimeout(this.timer);
    for (const e of this.cache.values()) if (e.state === 0) e.img.src = '';
    this.cache.clear();
  }

  private key = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

  private ready(z: number, x: number, y: number): HTMLImageElement | null {
    const e = this.cache.get(this.key(z, x, y));
    if (!e || e.state !== 1) return null;
    e.used = this.frame;
    return e.img;
  }

  /** Gewünschte Kacheln nachladen – gedrosselt, die nächsten zur Bildmitte zuerst. */
  private schedule() {
    if (this.timer) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      const list = this.wanted.sort((a, b) => a[3] - b[3]);
      for (const [z, x, y] of list) {
        if (this.loading >= MAX_LOADING) break;
        const k = this.key(z, x, y);
        if (this.cache.has(k)) continue;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        const e: Entry = { img, state: 0, used: this.frame };
        this.cache.set(k, e);
        this.loading++;
        img.onload = () => {
          // erst fertig entpacken, dann zeigen (kein Ruckeln beim ersten Zeichnen)
          img
            .decode()
            .catch(() => {})
            .finally(() => {
              this.loading--;
              e.state = 1;
              this.onLoad();
              if (this.wanted.length) this.schedule();
            });
        };
        img.onerror = () => {
          this.loading--;
          e.state = 2;
          if (this.wanted.length) this.schedule();
        };
        img.src = this.src.url(z, x, y);
      }
      this.evict();
    }, 90);
  }

  private evict() {
    if (this.cache.size <= MAX_ENTRIES) return;
    const old = [...this.cache.entries()].filter(([, e]) => e.state !== 0 && e.used < this.frame - 2).sort((a, b) => a[1].used - b[1].used);
    for (const [k] of old.slice(0, this.cache.size - MAX_ENTRIES)) this.cache.delete(k);
  }

  /** Zeichnet alle sichtbaren Kacheln. ctx ohne Transformation, t = Kartenzoom, w/h in CSS-Pixeln. */
  draw(ctx: CanvasRenderingContext2D, proj: GeoProjection, t: ZoomTransform, w: number, h: number, dpr: number) {
    this.frame++;
    const inv = proj.invert!;
    // sichtbarer Bereich in Längen/Breiten: Bildrand abtasten
    let lonMin = 180;
    let lonMax = -180;
    let latMin = 90;
    let latMax = -90;
    for (let i = 0; i <= 6; i++)
      for (let j = 0; j <= 6; j++) {
        const p = inv([((w * i) / 6 - t.x) / t.k, ((h * j) / 6 - t.y) / t.k]);
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        const lon = Math.max(-180, Math.min(180, p[0]));
        const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p[1]));
        if (lon < lonMin) lonMin = lon;
        if (lon > lonMax) lonMax = lon;
        if (lat < latMin) latMin = lat;
        if (lat > latMax) latMax = lat;
      }
    if (lonMin > lonMax || latMin > latMax) return;
    // etwas Rand, damit an den Ecken nichts fehlt
    const padLon = (lonMax - lonMin) * 0.06 + 0.01;
    const padLat = (latMax - latMin) * 0.06 + 0.01;
    lonMin = Math.max(-180, lonMin - padLon);
    lonMax = Math.min(180, lonMax + padLon);
    latMin = Math.max(-MAX_LAT, latMin - padLat);
    latMax = Math.min(MAX_LAT, latMax + padLat);

    // Kachelstufe aus dem Massstab in der Bildmitte
    const c = inv([(w / 2 - t.x) / t.k, (h / 2 - t.y) / t.k]) ?? [0, 0];
    const lat0 = Math.max(-80, Math.min(80, c[1]));
    const a = proj([c[0] - 0.5, lat0]);
    const b = proj([c[0] + 0.5, lat0]);
    const pxPerDeg = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) * t.k : 1;
    const sharp = Math.min(dpr, 2);
    let z = Math.floor(Math.log2((pxPerDeg * sharp * 360) / 256) + 0.35);
    z = Math.max(1, Math.min(this.src.maxZoom, z));
    let n = 2 ** z;
    let x0 = 0;
    let x1 = 0;
    let y0 = 0;
    let y1 = 0;
    const range = () => {
      n = 2 ** z;
      x0 = Math.max(0, Math.floor(((lonMin + 180) / 360) * n));
      x1 = Math.min(n - 1, Math.floor(((lonMax + 180) / 360) * n));
      y0 = Math.max(0, Math.floor(lat2y(latMax, n)));
      y1 = Math.min(n - 1, Math.floor(lat2y(latMin, n)));
    };
    range();
    while (z > 1 && (x1 - x0 + 1) * (y1 - y0 + 1) > 140) {
      z--;
      range();
    }

    // Teilung pro Kachel: weit weg stark gekrümmt, nah fast eben
    const N = z <= 2 ? 6 : z <= 4 ? 4 : z <= 6 ? 2 : 1;
    const want: [number, number, number, number][] = [];
    const cxT = ((c[0] + 180) / 360) * n;
    const cyT = lat2y(lat0, n);
    const P = (lon: number, lat: number): [number, number] => {
      const p = proj([lon, lat]) ?? [0, 0];
      return [p[0] * t.k + t.x, p[1] * t.k + t.y];
    };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        // Bild für diese Kachel: eigenes oder ein gröberes als Platzhalter
        let img = this.ready(z, tx, ty);
        let size = 256;
        let ox = 0;
        let oy = 0;
        if (!img) {
          want.push([z, tx, ty, Math.hypot(tx + 0.5 - cxT, ty + 0.5 - cyT)]);
          for (let d = 1; d <= 6 && z - d >= 0; d++) {
            const pimg = this.ready(z - d, tx >> d, ty >> d);
            if (pimg) {
              img = pimg;
              size = 256 / 2 ** d;
              ox = (tx - ((tx >> d) << d)) * size;
              oy = (ty - ((ty >> d) << d)) * size;
              break;
            }
          }
        }
        if (!img) continue;
        const lonW = (tx / n) * 360 - 180;
        const lonE = ((tx + 1) / n) * 360 - 180;
        for (let j = 0; j < N; j++) {
          const latT = y2lat(ty + j / N, n);
          const latB = y2lat(ty + (j + 1) / N, n);
          for (let i = 0; i < N; i++) {
            const l0 = lonW + ((lonE - lonW) * i) / N;
            const l1 = lonW + ((lonE - lonW) * (i + 1)) / N;
            const tl = P(l0, latT);
            const tr = P(l1, latT);
            const bl = P(l0, latB);
            const br = P(l1, latB);
            // ausserhalb des Bildes?
            const minX = Math.min(tl[0], tr[0], bl[0], br[0]);
            const maxX = Math.max(tl[0], tr[0], bl[0], br[0]);
            const minY = Math.min(tl[1], tr[1], bl[1], br[1]);
            const maxY = Math.max(tl[1], tr[1], bl[1], br[1]);
            if (maxX < 0 || minX > w || maxY < 0 || minY > h) continue;
            const s = size / N;
            const sx = ox + i * s;
            const sy = oy + j * s;
            // Wie stark weicht das Stück von einem Parallelogramm ab? Fast gar nicht: schnell zeichnen.
            // Sonst als zwei exakte Dreiecke – so treffen sich alle Kanten ohne Spalt.
            const twist = Math.hypot(br[0] - (tr[0] + bl[0] - tl[0]), br[1] - (tr[1] + bl[1] - tl[1]));
            if (twist < 0.35) {
              const ux = tr[0] - tl[0];
              const uy = tr[1] - tl[1];
              const vx = bl[0] - tl[0];
              const vy = bl[1] - tl[1];
              // 0.6 Pixel Überlappung gegen feine Nähte zwischen den Stücken
              const eu = 0.6 / Math.max(1, Math.hypot(ux, uy));
              const ev = 0.6 / Math.max(1, Math.hypot(vx, vy));
              ctx.setTransform(ux * dpr, uy * dpr, vx * dpr, vy * dpr, tl[0] * dpr, tl[1] * dpr);
              ctx.drawImage(img, sx, sy, s, s, -eu, -ev, 1 + 2 * eu, 1 + 2 * ev);
            } else {
              tri(ctx, img, sx, sy, s, dpr, tl, tr, bl, tl, [tr[0] - tl[0], tr[1] - tl[1]], [bl[0] - tl[0], bl[1] - tl[1]]);
              tri(ctx, img, sx, sy, s, dpr, tr, br, bl, [tr[0] - br[0] + bl[0], tr[1] - br[1] + bl[1]], [br[0] - bl[0], br[1] - bl[1]], [br[0] - tr[0], br[1] - tr[1]]);
            }
          }
        }
      }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.wanted = want;
    if (want.length) this.schedule();
  }
}

type Pt = [number, number] | number[];
/**
 * Ein Dreieck eines Kachelstücks zeichnen: auf das Dreieck (leicht vergrössert, gegen Nähte) zuschneiden,
 * dann das Quadrat des Bildes mit der Abbildung o + u·x + v·y (x, y in 0…1) hineinlegen.
 */
function tri(ctx: CanvasRenderingContext2D, img: CanvasImageSource, sx: number, sy: number, s: number, dpr: number, a: Pt, b: Pt, c: Pt, o: Pt, u: Pt, v: Pt) {
  const cx = (a[0] + b[0] + c[0]) / 3;
  const cy = (a[1] + b[1] + c[1]) / 3;
  const grow = (p: Pt): [number, number] => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / d) * 0.7, p[1] + (dy / d) * 0.7];
  };
  const A = grow(a);
  const B = grow(b);
  const C = grow(c);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(B[0], B[1]);
  ctx.lineTo(C[0], C[1]);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(u[0] * dpr, u[1] * dpr, v[0] * dpr, v[1] * dpr, o[0] * dpr, o[1] * dpr);
  // das Bild um 0.6 Pixel grösser legen, damit der vergrösserte Rand gefüllt ist (gegen Nähte)
  const eu = 0.6 / Math.max(1, Math.hypot(u[0], u[1]));
  const ev = 0.6 / Math.max(1, Math.hypot(v[0], v[1]));
  ctx.drawImage(img, sx, sy, s, s, -eu, -ev, 1 + 2 * eu, 1 + 2 * ev);
  ctx.restore();
}
