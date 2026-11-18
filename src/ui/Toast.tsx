import { useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';

let show: ((msg: string, err: boolean) => void) | null = null;
let timer = 0;

export const toast = (msg: string, err = false) => show?.(msg, err);

/** Schmale Meldung oben; lässt sich antippen oder nach oben/seitlich wegwischen. */
export function ToastHost() {
  const [state, setState] = useState<{ msg: string; err: boolean; on: boolean }>({ msg: '', err: false, on: false });
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const hide = () => {
    clearTimeout(timer);
    setState((s) => ({ ...s, on: false }));
  };
  show = (msg, err) => {
    clearTimeout(timer);
    if (ref.current) ref.current.style.transform = '';
    setState({ msg, err, on: true });
    timer = window.setTimeout(hide, err ? 4500 : 2600);
  };
  const onDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    clearTimeout(timer);
    ref.current?.setPointerCapture(e.pointerId);
    ref.current?.classList.add('dragging');
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    d.dx = e.clientX - d.x;
    d.dy = Math.min(0, e.clientY - d.y); // nur nach oben
    ref.current.style.transform = `translate(calc(-50% + ${d.dx}px), ${d.dy}px)`;
    ref.current.style.opacity = String(Math.max(0.2, 1 - (Math.abs(d.dx) + Math.abs(d.dy)) / 220));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current;
    if (!el || !d) return;
    el.classList.remove('dragging');
    el.style.opacity = '';
    const tap = Math.abs(d.dx) < 6 && Math.abs(d.dy) < 6;
    if (tap || Math.abs(d.dx) > 60 || d.dy < -30) {
      // in Wischrichtung hinausgleiten lassen
      el.style.transform = Math.abs(d.dx) > 60 ? `translate(calc(-50% + ${Math.sign(d.dx) * 120}vw), 0)` : '';
      hide();
      setTimeout(() => el && (el.style.transform = ''), 350);
    } else {
      el.style.transform = '';
      timer = window.setTimeout(hide, 2000);
    }
  };
  return (
    <div
      ref={ref}
      class={`toast mat ${state.on ? 'show' : ''} ${state.err ? 'err' : ''}`}
      role="status"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <Icon name={state.err ? 'alert' : 'check'} stroke={2.4} />
      <span>{state.msg}</span>
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
