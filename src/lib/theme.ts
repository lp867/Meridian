// Hell/Dunkel: setzt data-theme auf <html> und die Statusleisten-Farbe.
// Beim Umschalten breitet sich das neue Design als Kreis vom angetippten Schalter aus
// (View Transitions API). Ohne Unterstützung oder bei «Bewegung reduzieren»: sofort.
type Theme = 'system' | 'dark' | 'light';
const media = window.matchMedia('(prefers-color-scheme: light)');
let current: Theme = 'dark';

const resolve = (theme: Theme): 'dark' | 'light' => (theme === 'system' ? (media.matches ? 'light' : 'dark') : theme);
const shown = () => document.documentElement.dataset.theme as 'dark' | 'light' | undefined;

function paint() {
  const mode = resolve(current);
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f2f3f7' : '#08090c');
}

/** Setzt das Design ohne Animation (Start, Systemwechsel). */
export function applyTheme(theme: Theme) {
  current = theme;
  if (shown() !== resolve(theme)) paint();
}

// Letzter Tipp-/Klickpunkt als Mittelpunkt des Kreises
let lastX = innerWidth / 2;
let lastY = innerHeight / 2;
document.addEventListener(
  'pointerdown',
  (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
  },
  { passive: true, capture: true },
);

/** Wechselt das Design mit wachsendem Kreis ab der zuletzt angetippten Stelle. */
export function switchTheme(theme: Theme) {
  const before = shown();
  current = theme;
  const after = resolve(theme);
  const root = document.documentElement;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } }).startViewTransition;
  if (before === after || calm || !vt) {
    paint();
    return;
  }
  const x = Math.round(lastX);
  const y = Math.round(lastY);
  const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
  root.classList.add('theme-switching');
  const transition = vt.call(document, paint);
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 550, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  transition.finished.finally(() => root.classList.remove('theme-switching'));
}

media.addEventListener('change', () => current === 'system' && switchTheme('system'));
