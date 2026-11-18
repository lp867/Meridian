// Hell/Dunkel: setzt data-theme auf <html> und die Statusleisten-Farbe.
type Theme = 'system' | 'dark' | 'light';
const media = window.matchMedia('(prefers-color-scheme: light)');
let current: Theme = 'dark';

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') return media.matches ? 'light' : 'dark';
  return theme;
}

function paint() {
  const mode = resolve(current);
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  const color = mode === 'light' ? '#f2f3f7' : '#08090c';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function applyTheme(theme: Theme) {
  current = theme;
  // Farben gleiten weich über, statt hart umzuspringen
  document.documentElement.classList.add('theme-fade');
  paint();
  setTimeout(() => document.documentElement.classList.remove('theme-fade'), 500);
}

media.addEventListener('change', () => current === 'system' && applyTheme('system'));
