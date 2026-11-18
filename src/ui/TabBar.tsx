import { t as tr } from '../lib/i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { slideLens } from './kit';
import { springs } from '../lib/spring';

export type TabId = 'map' | 'countries' | 'trips' | 'flights' | 'profile';
export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'map', label: 'Karte', icon: 'globe' },
  { id: 'countries', label: 'Länder', icon: 'flag' },
  { id: 'trips', label: 'Trips', icon: 'suitcase' },
  { id: 'flights', label: 'Flüge', icon: 'plane' },
  { id: 'profile', label: 'Profil', icon: 'user' },
];

const LIFT = 1.1;

/**
 * Schwebende Kapsel mit einer Linse, die zum aktiven Tab gleitet.
 * Wie bei Liquid Glass lässt sich die Linse auch mit dem Finger ziehen.
 */
export function TabBar({ active, onSelect, hidden, badge }: { active: TabId; onSelect: (t: TabId) => void; hidden?: boolean; badge?: TabId | null }) {
  const bar = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const last = useRef<{ x: number; w: number } | null>(null);
  const drag = useRef<{ x0: number; moved: boolean; grab: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const idx = TABS.findIndex((t) => t.id === active);

  const slot = (i: number) => {
    const el = bar.current!.querySelectorAll<HTMLElement>('.tab')[i];
    return { x: el.offsetLeft - 6, w: el.offsetWidth };
  };
  // Skalierung um die Mitte, obwohl transform-origin links liegt
  const lifted = (x: number, w: number, s = LIFT) => `translateX(${x - (w * (s - 1)) / 2}px) scale(${s}, ${s + 0.04})`;

  useLayoutEffect(() => {
    if (!lens.current || !bar.current) return;
    const to = slot(idx);
    lens.current.style.transition = 'none';
    slideLens(lens.current, last.current, to);
    last.current = to;
  }, [idx]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!lens.current || !bar.current || drag.current) return;
      const to = slot(idx);
      lens.current.style.width = `${to.w}px`;
      lens.current.style.transform = `translateX(${to.x}px)`;
      last.current = to;
    });
    if (bar.current) ro.observe(bar.current);
    return () => ro.disconnect();
  }, [idx]);

  const indexAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    const rel = (clientX - r.left - 6) / (r.width - 12);
    return Math.max(0, Math.min(TABS.length - 1, Math.floor(rel * TABS.length)));
  };

  const onDown = (e: PointerEvent) => {
    if (!bar.current || !lens.current) return;
    const s = slot(idx);
    const left = bar.current.getBoundingClientRect().left + 6;
    const onLens = indexAt(e.clientX) === idx;
    drag.current = { x0: e.clientX, moved: false, grab: onLens ? e.clientX - left - s.x : s.w / 2 };
    if (onLens) {
      lens.current.style.transition = `transform 240ms cubic-bezier(.2,.9,.3,1.25)`;
      lens.current.style.transform = lifted(s.x, s.w);
    }
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !lens.current || !bar.current) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 8) return;
    if (!d.moved) {
      d.moved = true;
      bar.current.setPointerCapture(e.pointerId);
      bar.current.classList.add('dragging');
    }
    const r = bar.current.getBoundingClientRect();
    const w = last.current!.w;
    const x = Math.max(-6, Math.min(r.width - 12 - w + 6, e.clientX - r.left - 6 - d.grab));
    lens.current.style.transition = 'none';
    lens.current.style.transform = lifted(x, w, LIFT + 0.03);
    setHover(indexAt(r.left + 6 + x + w / 2));
  };

  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    bar.current?.classList.remove('dragging');
    setHover(null);
    if (!d || !lens.current || !bar.current) return;
    let target = indexAt(e.clientX);
    if (d.moved) {
      const r = bar.current.getBoundingClientRect();
      const w = last.current!.w;
      const x = Math.max(-6, Math.min(r.width - 12 - w + 6, e.clientX - r.left - 6 - d.grab));
      target = indexAt(r.left + 6 + x + w / 2);
      last.current = { x, w };
    }
    if (target !== idx) {
      onSelect(TABS[target].id);
      return;
    }
    // gleicher Tab: Linse federnd absetzen
    const s = slot(idx);
    lens.current.style.transition = `transform ${springs.bounce.ms}ms ${springs.bounce.easing}`;
    lens.current.style.transform = `translateX(${s.x}px)`;
    last.current = s;
    if (!d.moved) onSelect(TABS[target].id); // erneutes Tippen: zurück zum Anfang
  };

  return (
    <nav
      class={`tabbar mat ${hidden ? 'hidden' : ''}`}
      ref={bar}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div class="lens" ref={lens} style={{ transformOrigin: '0 50%' }} />
      {TABS.map((t, i) => (
        <button
          class={`tab ${i === idx ? 'on' : ''} ${hover === i ? 'hover' : ''}`}
          aria-label={tr(t.label)}
          aria-current={i === idx}
          onClick={(e) => {
            if ((e as MouseEvent).detail === 0) onSelect(t.id); // Tastatur
          }}
        >
          <Icon name={t.icon} stroke={i === idx ? 2.1 : 1.8} />
          <span>{tr(t.label)}</span>
          {badge === t.id && <i class="tab-badge" />}
        </button>
      ))}
    </nav>
  );
}
