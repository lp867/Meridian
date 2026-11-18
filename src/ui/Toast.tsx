import { useState } from 'preact/hooks';
import { Icon } from './Icon';

let show: ((msg: string, err: boolean) => void) | null = null;
let timer = 0;

export const toast = (msg: string, err = false) => show?.(msg, err);

export function ToastHost() {
  const [state, setState] = useState<{ msg: string; err: boolean; on: boolean }>({ msg: '', err: false, on: false });
  show = (msg, err) => {
    clearTimeout(timer);
    setState({ msg, err, on: true });
    timer = window.setTimeout(() => setState((s) => ({ ...s, on: false })), err ? 4200 : 2600);
  };
  return (
    <div class={`toast mat ${state.on ? 'show' : ''} ${state.err ? 'err' : ''}`} role="status">
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
