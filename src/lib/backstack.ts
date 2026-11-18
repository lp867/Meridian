// Verbindet Sheets und Unterseiten mit dem Browser-Verlauf,
// damit die Zurück-Geste von Android sie schliesst.
type Entry = { close: () => void };
const stack: Entry[] = [];
let suppress = 0;
let after: (() => void)[] = [];

window.addEventListener('popstate', () => {
  if (suppress > 0) {
    suppress--;
  } else {
    stack.pop()?.close();
  }
  const run = after;
  after = [];
  run.forEach((fn) => setTimeout(fn, 0));
});

/** Schliesst die oberste Ebene und führt danach fn aus (z. B. Sheet zu, dann Seite öffnen). */
export function goBackThen(fn: () => void) {
  if (!stack.length) return fn();
  after.push(fn);
  history.back();
}

export function pushBack(close: () => void) {
  const entry = { close };
  stack.push(entry);
  history.pushState({ depth: stack.length }, '');
  return entry;
}

/** Schliesst die oberste Ebene über den Verlauf (wie die Zurück-Taste). */
export function goBack() {
  if (stack.length) history.back();
}

/** Entfernt Einträge ohne deren close() aufzurufen (die UI räumt selbst auf). */
export function dropBack(entries: Entry[]) {
  const n = entries.filter((e) => stack.includes(e)).length;
  if (!n) return;
  for (const e of entries) {
    const i = stack.indexOf(e);
    if (i >= 0) stack.splice(i, 1);
  }
  suppress++;
  history.go(-n);
}

export const backDepth = () => stack.length;
