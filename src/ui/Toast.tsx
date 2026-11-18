import { useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { t } from '../lib/i18n';

let show: ((msg: string, err: boolean) => void) | null = null;
let timer = 0;

export const toast = (msg: string, err = false) => show?.(msg, err);

type Drag = { x: number; y: number; t: number; dx: number; dy: number; vx: number; vy: number; axis: 'x' | 'y' | null };

/**
 * Meldung wie eine iOS-Mitteilung: gleitet oben herein, nach oben wegwischen schliesst sie,
 * nach unten gibt sie nur leicht nach. Zusätzlich (wie bei Samsung) seitlich wegwischbar.
 */
export function ToastHost() {
  const [state, setState] = useState<{ msg: string; err: boolean; on: boolean }>({ msg: '', err: false, on: false });
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
  };
  const hide = () => {
    clearTimeout(timer);
    setState((s) => ({ ...s, on: false }));
  };
  const autoHide = (ms: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(hide, ms);
  };
  show = (msg, err) => {
    reset();
    setState({ msg, err, on: true });
    autoHide(err ? 5000 : 3200);
  };

  const onDown = (e: PointerEvent) => {
    if (!state.on) return;
    clearTimeout(timer); // nicht verschwinden, solange der Finger drauf ist
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0, vx: 0, vy: 0, axis: null };
    ref.current?.setPointerCapture(e.pointerId);
    ref.current?.classList.add('dragging');
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.vx = (dx - d.dx) / dt;
    d.vy = (dy - d.dy) / dt;
    d.dx = dx;
    d.dy = dy;
    d.t = now;
    if (!d.axis && Math.hypot(dx, dy) > 6) d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (d.axis === 'x') {
      el.style.transform = `translate3d(${dx}px, 0, 0)`;
      el.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / (el.offsetWidth * 1.1)));
    } else if (d.axis === 'y') {
      // nach oben folgt sie dem Finger, nach unten gibt sie nur gedämpft nach
      const ty = dy < 0 ? dy : Math.min(24, dy * 0.25);
      el.style.transform = `translate3d(0, ${ty}px, 0)`;
    }
  };

  const onUp = () => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    el.classList.remove('dragging');

    // Antippen schliesst wie bei iOS
    if (!d.axis) {
      reset();
      hide();
      return;
    }
    if (d.axis === 'x' && (Math.abs(d.dx) > el.offsetWidth * 0.3 || Math.abs(d.vx) > 0.5)) {
      // seitlich hinausgleiten (Samsung)
      const dir = Math.sign(d.dx || d.vx);
      el.style.transition = 'transform 0.24s ease-out, opacity 0.24s ease-out';
      el.style.transform = `translate3d(${dir * (el.offsetWidth + 40)}px, 0, 0)`;
      el.style.opacity = '0';
      setTimeout(() => {
        hide();
        // ohne Übergang zurück in die Ausgangslage, damit die nächste Meldung normal erscheint
        setTimeout(() => {
          if (!el) return;
          el.style.transition = 'none';
          el.style.transform = '';
          el.style.opacity = '';
          requestAnimationFrame(() => (el.style.transition = ''));
        }, 30);
      }, 240);
      return;
    }
    if (d.axis === 'y' && (d.dy < -24 || d.vy < -0.4)) {
      // nach oben wegwischen (iOS): von der aktuellen Lage weiter nach oben gleiten
      el.style.transform = '';
      el.style.opacity = '';
      hide();
      return;
    }
    // zurückfedern
    el.style.transform = '';
    el.style.opacity = '';
    autoHide(2500);
  };

  return (
    <div
      ref={ref}
      class={`notif ${state.on ? 'show' : ''} ${state.err ? 'err' : ''}`}
      role="status"
      aria-live="polite"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div class="notif-icon">
        <Icon name={state.err ? 'alert' : 'globe'} stroke={2.2} />
      </div>
      <div class="notif-body">
        <div class="notif-head">
          <b>Meridian</b>
          <span>{t('jetzt')}</span>
        </div>
        <div class="notif-text">{state.msg}</div>
      </div>
    </div>
  );
}

/** Ein Listener für alle .press-Elemente: Lichtpunkt am Finger + Wachsen. */
export function installPressFeedback() {
  let current: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  const release = () => {
    current?.classList.remove('is-pressed');
    current = null;
  };
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.press');
      if (!el || (el as HTMLButtonElement).disabled) return;
      el.classList.add('is-pressed');
      current = el;
      startX = e.clientX;
      startY = e.clientY;
    },
    { passive: true },
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!current) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 12) release();
    },
    { passive: true },
  );
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('scroll', release, { passive: true, capture: true });

}
