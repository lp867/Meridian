import { t } from '../lib/i18n';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { goBack, pushBack } from '../lib/backstack';
import { springs } from '../lib/spring';
import { Icon } from './Icon';

type SheetEntry = { key: number; render: () => ComponentChildren; tall?: boolean; closing: boolean; onClose?: () => void };
let seq = 0;
let setSheets: ((fn: (s: SheetEntry[]) => SheetEntry[]) => void) | null = null;

/** Öffnet ein Sheet. Schliessen über closeSheet() oder die Zurück-Geste. */
export function openSheet(render: () => ComponentChildren, opts: { tall?: boolean; onClose?: () => void } = {}) {
  const key = ++seq;
  setSheets?.((s) => [...s, { key, render, tall: opts.tall, closing: false }]);
  pushBack(() => {
    opts.onClose?.();
    setSheets?.((s) => s.map((x) => (x.key === key ? { ...x, closing: true } : x)));
    setTimeout(() => setSheets?.((s) => s.filter((x) => x.key !== key)), springs.smooth.ms + 80);
  });
  return key;
}

export const closeSheet = () => goBack();

export function SheetHost() {
  const [sheets, set] = useState<SheetEntry[]>([]);
  setSheets = set;
  return (
    <>
      {sheets.map((s) => (
        <SheetView key={s.key} entry={s} />
      ))}
    </>
  );
}

function SheetView({ entry }: { entry: SheetEntry }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // Erst nach dem Einhängen öffnen, damit die Federanimation sichtbar ist
    let r2 = 0;
    const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))));
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);
  const open = shown && !entry.closing;
  const drag = useRef<{ y0: number; t0: number; dy: number; active: boolean } | null>(null);

  const onDown = (e: PointerEvent) => {
    const body = ref.current?.querySelector('.sheet-body');
    const inHead = (e.target as HTMLElement).closest('.sheet-head');
    if (!inHead && body && body.scrollTop > 0) return;
    if ((e.target as HTMLElement).closest('input,textarea,select,button,.seg,.chips')) return;
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0, active: false };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    if (!d.active && d.dy > 8) {
      d.active = true;
      ref.current.classList.add('dragging');
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (d.active) {
      const resist = d.dy < 0 ? d.dy / 3 : d.dy;
      ref.current.style.setProperty('--drag', `${resist}px`);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active || !ref.current) return;
    ref.current.classList.remove('dragging');
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    ref.current.style.setProperty('--drag', '0px');
    if (d.dy > 140 || v > 0.7) goBack();
  };

  return (
    <div class="sheet-root">
      <div class={`sheet-backdrop ${open ? 'open' : ''}`} onClick={goBack} />
      <div
        ref={ref}
        class={`sheet ${open ? 'open' : ''} ${entry.tall ? 'tall' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {entry.render()}
      </div>
    </div>
  );
}

export function SheetHeader({ title, action }: { title: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="sheet-head">
      <div class="grabber" />
      <div class="sheet-title">
        <h2>{title}</h2>
        {action ?? (
          <button class="icon-btn mat press" onClick={goBack} aria-label={t('Schliessen')} style={{ width: '36px', height: '36px' }}>
            <Icon name="x" stroke={2.4} size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Bestätigungsdialog als kleines Sheet. */
export function confirmSheet(opts: { title: string; text: ComponentChildren; ok: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      resolve(v);
      goBack();
    };
    openSheet(
      () => (
      <>
        <SheetHeader title={opts.title} />
        <div class="sheet-body" style={{ paddingBottom: '10px' }}>
          <p class="hint" style={{ margin: '0 20px 18px', fontSize: '15px', color: 'var(--text2)' }}>
            {opts.text}
          </p>
          <div class="sheet-actions">
            <button class="btn press" onClick={() => finish(false)}>
              {t('Abbrechen')}
            </button>
            <button class={`btn press ${opts.danger ? 'danger' : 'primary'}`} onClick={() => finish(true)}>
              {opts.ok}
            </button>
          </div>
        </div>
      </>
      ),
      {
        onClose: () => {
          if (!done) {
            done = true;
            resolve(false);
          }
        },
      },
    );
  });
}
