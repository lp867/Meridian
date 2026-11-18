// Federkurven als CSS-linear()-Easing: läuft komplett auf dem Compositor und bleibt flüssig.
export interface Spring {
  easing: string;
  ms: number;
}

/** duration = Reaktionszeit in Sekunden, bounce 0 = ohne Überschwingen (wie SwiftUI). */
export function spring(duration: number, bounce: number): Spring {
  const w0 = (2 * Math.PI) / duration;
  const zeta = Math.max(0.05, 1 - bounce);
  const pos = (t: number) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  // Ausschwingzeit: ab wann bleibt die Abweichung unter 0.1 %
  let settle = 0;
  for (let t = 0; t < 3; t += 0.005) if (Math.abs(1 - pos(t)) > 0.001) settle = t;
  settle = Math.min(Math.max(settle, duration * 0.6), 1.6);
  const n = 56;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) pts.push(pos((settle * i) / n).toFixed(4).replace(/\.?0+$/, '') || '0');
  pts[n] = '1';
  return { easing: `linear(${pts.join(', ')})`, ms: Math.round(settle * 1000) };
}

const supportsLinear = typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)');

export const springs = {
  smooth: supportsLinear ? spring(0.42, 0) : { easing: 'cubic-bezier(.2,.9,.25,1)', ms: 420 },
  bounce: supportsLinear ? spring(0.5, 0.3) : { easing: 'cubic-bezier(.3,1.4,.5,1)', ms: 520 },
  snappy: supportsLinear ? spring(0.32, 0.15) : { easing: 'cubic-bezier(.25,1.2,.5,1)', ms: 340 },
  gentle: supportsLinear ? spring(0.6, 0.12) : { easing: 'cubic-bezier(.2,.9,.3,1)', ms: 600 },
};

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function installSpringVars() {
  const root = document.documentElement.style;
  for (const [name, s] of Object.entries(springs)) {
    root.setProperty(`--ease-${name}`, s.easing);
    root.setProperty(`--dur-${name}`, `${s.ms}ms`);
  }
}
