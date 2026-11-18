import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon';
import { slideLens } from './kit';
import { t as tr } from '../lib/i18n';

export type TabId = 'map' | 'countries' | 'profile';
export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'map', label: 'Karte', icon: 'globe' },
  { id: 'countries', label: 'Länder', icon: 'flag' },
  { id: 'profile', label: 'Profil', icon: 'user' },
];

/** Schwebende Kapsel; die Markierung gleitet ruhig zum aktiven Tab. */
export function TabBar({ active, onSelect, badge }: { active: TabId; onSelect: (t: TabId) => void; badge?: TabId | null }) {
  const bar = useRef<HTMLElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const last = useRef<{ x: number; w: number } | null>(null);
  const idx = TABS.findIndex((x) => x.id === active);

  const slot = (i: number) => {
    const el = bar.current!.querySelectorAll<HTMLElement>('.tab')[i];
    return { x: el.offsetLeft - 6, w: el.offsetWidth };
  };

  useLayoutEffect(() => {
    if (!lens.current || !bar.current) return;
    const to = slot(idx);
    slideLens(lens.current, last.current, to);
    last.current = to;
  }, [idx]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!lens.current || !bar.current) return;
      const to = slot(idx);
      lens.current.style.width = `${to.w}px`;
      lens.current.style.transform = `translateX(${to.x}px)`;
      last.current = to;
    });
    if (bar.current) ro.observe(bar.current);
    return () => ro.disconnect();
  }, [idx]);

  return (
    <nav class="tabbar mat" ref={bar}>
      <div class="lens" ref={lens} style={{ transformOrigin: '0 50%' }} />
      {TABS.map((x, i) => (
        <button class={`tab ${i === idx ? 'on' : ''}`} aria-label={tr(x.label)} aria-current={i === idx} onClick={() => onSelect(x.id)}>
          <Icon name={x.icon} stroke={i === idx ? 2.1 : 1.8} />
          <span>{tr(x.label)}</span>
          {badge === x.id && <i class="tab-badge" />}
        </button>
      ))}
    </nav>
  );
}
