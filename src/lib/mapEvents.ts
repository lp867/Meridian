// "Städte auf der Karte wählen" von anderen Bildschirmen aus: App wechselt zur Karte,
// die Karte schaltet den Städte-Modus ein (optional gleich auf ein Land gefiltert).
type Request = { cc: string | null };
const listeners = new Set<(r: Request) => void>();

export function showCitiesOnMap(cc: string | null = null) {
  listeners.forEach((fn) => fn({ cc }));
}

export function onShowCitiesOnMap(fn: (r: Request) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
