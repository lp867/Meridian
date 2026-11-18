import { t } from '../lib/i18n';
import type { ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { reducedMotion, springs } from '../lib/spring';
import { fmtInt } from '../lib/format';
import { Icon } from './Icon';
import { goBack } from '../lib/backstack';

/** Markierung, die ruhig zur gewählten Option gleitet (nur transform, läuft auf der GPU). */
export function slideLens(el: HTMLElement, from: { x: number; w: number } | null, to: { x: number; w: number }) {
  el.style.width = `${to.w}px`;
  el.style.transform = `translateX(${to.x}px)`;
  if (!from || reducedMotion() || (from.x === to.x && from.w === to.w)) return;
  el.animate([{ transform: `translateX(${from.x}px) scaleX(${from.w / to.w})` }, { transform: `translateX(${to.x}px) scaleX(1)` }], {
    duration: springs.smooth.ms,
    easing: springs.smooth.easing,
  });
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  tone,
  style,
}: {
  value: T;
  options: { value: T; label: ComponentChildren }[];
  onChange: (v: T) => void;
  tone?: 'accent' | 'wish';
  style?: CSSProperties;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const last = useRef<{ x: number; w: number } | null>(null);
  const idx = options.findIndex((o) => o.value === value);

  const place = (animate: boolean) => {
    const opt = wrap.current?.querySelectorAll<HTMLElement>('.seg-opt')[idx];
    if (!opt || !thumb.current) {
      if (thumb.current) thumb.current.style.opacity = '0';
      return;
    }
    thumb.current.style.opacity = '1';
    const to = { x: opt.offsetLeft, w: opt.offsetWidth };
    slideLens(thumb.current, animate ? last.current : null, to);
    last.current = to;
  };
  useLayoutEffect(() => place(true), [idx, options.length]);
  useEffect(() => {
    const ro = new ResizeObserver(() => place(false));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [idx]);

  return (
    <div class={`seg ${tone ?? ''}`} ref={wrap} style={style}>
      <div class="seg-thumb" ref={thumb} style={{ transformOrigin: '0 50%' }} />
      {options.map((o) => (
        <button class={`seg-opt ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children, count }: { on?: boolean; onClick?: () => void; children: ComponentChildren; count?: number }) {
  return (
    <button class={`chip press ${on ? 'on' : ''}`} onClick={onClick}>
      {children}
      {count != null && <span class="count">{fmtInt(count)}</span>}
    </button>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button class={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} />;
}

export function SearchField({ value, onInput, placeholder, autoFocus }: { value: string; onInput: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 350);
  }, []);
  return (
    <label class="search">
      <Icon name="search" />
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        spellcheck={false}
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
      />
      {value && (
        <button class="clear" onClick={() => onInput('')} aria-label={t('Leeren')}>
          <Icon name="x" stroke={2.6} />
        </button>
      )}
    </label>
  );
}

/** Zahl formatiert anzeigen (ohne Hochzählen – ruhiger und sparsamer). */
export function AnimatedNumber({ value, format = fmtInt }: { value: number; format?: (n: number) => string }) {
  return <span class="num">{format(Math.round(value * 10) / 10)}</span>;
}

export function Ring({ value, size = 54, stroke = 6 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--s3)" stroke-width={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        stroke-width={stroke}
        stroke-linecap="round"
        stroke-dasharray={`${c} ${c}`}
        style={{
          strokeDashoffset: `${c * (1 - Math.min(1, value))}`,
          transition: 'stroke-dashoffset var(--dur-gentle) var(--ease-gentle)',
        }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7cb6ff" />
          <stop offset="1" stop-color="#2f7ff0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div class={`progress ${value >= 1 ? 'done' : ''}`}>
      <i style={{ '--p': String(Math.min(1, value)) } as CSSProperties} />
    </div>
  );
}

/** Kompakte Leiste oben; der Titel blendet ein, sobald der grosse Titel wegscrollt. */
export function NavBar({ title, back, right, left }: { title?: string; back?: boolean; right?: ComponentChildren; left?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroller = ref.current?.closest('.screen');
    if (!scroller) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrolled(scroller.scrollTop > 46));
    };
    scroller.addEventListener('scroll', on, { passive: true });
    return () => scroller.removeEventListener('scroll', on);
  }, []);
  return (
    <div class={`nav-bar ${scrolled ? 'scrolled' : ''}`} ref={ref}>
      <div class="side">
        {back && (
          <button class="icon-btn mat press" onClick={goBack} aria-label={t('Zurück')}>
            <Icon name="chevL" stroke={2.3} />
          </button>
        )}
        {left}
      </div>
      <div class="mid">{title}</div>
      <div class="side r">{right}</div>
    </div>
  );
}

export function LargeTitle({ children, sub }: { children: ComponentChildren; sub?: ComponentChildren }) {
  return (
    <div class="large-title">
      {children}
      {sub && <span class="sub">{sub}</span>}
    </div>
  );
}

export function Row({
  lead,
  leadClass,
  title,
  sub,
  trail,
  chevron,
  onClick,
  style,
}: {
  lead?: ComponentChildren;
  leadClass?: string;
  title: ComponentChildren;
  sub?: ComponentChildren;
  trail?: ComponentChildren;
  chevron?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const content = (
    <>
      {lead != null && <div class={`lead ${leadClass ?? ''}`}>{lead}</div>}
      <div class="main">
        <div class="t">{title}</div>
        {sub && <div class="s">{sub}</div>}
      </div>
      {(trail != null || chevron) && (
        <div class="trail">
          {trail}
          {chevron && (
            <span class="chev">
              <Icon name="chevR" stroke={2.4} />
            </span>
          )}
        </div>
      )}
    </>
  );
  return onClick ? (
    <button class="row press press-row" onClick={onClick} style={style}>
      {content}
    </button>
  ) : (
    <div class="row" style={style}>
      {content}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="empty pop-in">
      <div class="ico">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action, onAction }: { children: ComponentChildren; action?: string; onAction?: () => void }) {
  return (
    <div class="section-title">
      <span>{children}</span>
      {action && (
        <button class="act" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export const stagger = (i: number) => ({ '--i': String(i) }) as CSSProperties;

/** Weicher Wechsel zwischen Ansichten; gleitet in Richtung des gewählten Segments. */
export function Swap<T extends string>({ value, order, children }: { value: T; order: T[]; children: ComponentChildren }) {
  const prev = useRef(value);
  const dir = Math.sign(order.indexOf(value) - order.indexOf(prev.current));
  useEffect(() => {
    prev.current = value;
  }, [value]);
  return (
    <div key={value} class="swap" style={{ '--dir': String(dir) } as CSSProperties}>
      {children}
    </div>
  );
}
