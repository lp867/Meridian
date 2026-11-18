import { createContext, type ComponentChildren } from 'preact';
import { useContext, useMemo, useRef, useState } from 'preact/hooks';
import { dropBack, pushBack } from '../lib/backstack';
import { springs } from '../lib/spring';

type Entry = { key: number; node: ComponentChildren; leaving: boolean; back: { close: () => void } };

export interface Nav {
  push: (node: ComponentChildren) => void;
  popToRoot: () => void;
  depth: () => number;
}

const NavCtx = createContext<Nav>({ push: () => {}, popToRoot: () => {}, depth: () => 0 });
export const useNav = () => useContext(NavCtx);

let seq = 0;

/** Navigationsstapel des aktiven Tabs (für Sheets, die Seiten öffnen). */
export const navRegistry: { active: Nav | null } = { active: null };

/** Navigationsstapel eines Tabs: Unterseiten gleiten von rechts herein (wie iOS). */
export function Stack({ root, navRef }: { root: ComponentChildren; navRef?: (nav: Nav) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const rootRef = useRef<HTMLDivElement>(null);

  const nav = useMemo<Nav>(
    () => ({
      push(node) {
        const key = ++seq;
        const back = pushBack(() => {
          setEntries((e) => e.map((x) => (x.key === key ? { ...x, leaving: true } : x)));
          setTimeout(() => setEntries((e) => e.filter((x) => x.key !== key)), springs.smooth.ms * 0.85 + 40);
        });
        setEntries((e) => [...e, { key, node, leaving: false, back }]);
      },
      popToRoot() {
        const current = entriesRef.current;
        if (current.length) {
          dropBack(current.map((e) => e.back));
          setEntries([]);
        } else rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      },
      depth: () => entriesRef.current.filter((e) => !e.leaving).length,
    }),
    [],
  );
  navRef?.(nav);

  const live = entries.filter((e) => !e.leaving);
  return (
    <NavCtx.Provider value={nav}>
      <div class={`screen ${live.length ? 'under' : ''}`} ref={rootRef}>
        {root}
      </div>
      {entries.map((e) => {
        const idx = live.indexOf(e);
        const under = idx >= 0 && idx < live.length - 1;
        return (
          <div key={e.key} class={`screen pushed ${e.leaving ? 'leave' : 'enter'} ${under ? 'under' : ''}`}>
            {e.node}
          </div>
        );
      })}
    </NavCtx.Provider>
  );
}
