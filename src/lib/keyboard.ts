// Bildschirmtastatur am Handy: Solange sie offen ist, bekommt <html> die Klasse "kb-open".
// Die Tab-Leiste bleibt dann unten (hinter der Tastatur) statt mit nach oben zu rutschen,
// und Platzfresser wie die Übersichtskarte klappen weg.

const TEXT_TYPES = new Set(['text', 'search', 'email', 'password', 'url', 'tel', 'number', '']);

const isField = (el: Element | null): boolean => {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return TEXT_TYPES.has((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable;
};

export function watchKeyboard() {
  // Nur auf Touch-Geräten: am PC gibt es keine Bildschirmtastatur
  if (!matchMedia('(pointer: coarse)').matches) return;
  const root = document.documentElement;
  let full = window.innerHeight;
  let shrunk = false;
  const set = (on: boolean) => root.classList.toggle('kb-open', on);

  // Schon beim Antippen des Feldes ausblenden, bevor die Tastatur hochfährt (kein Springen)
  document.addEventListener('focusin', (e) => {
    if (isField(e.target as Element)) set(true);
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isField(document.activeElement)) set(false);
    }, 60);
  });

  // Tastatur mit der Zurück-Taste geschlossen (Feld bleibt fokussiert) oder wieder geöffnet
  window.addEventListener('resize', () => {
    const h = window.innerHeight;
    if (!shrunk && h > full) full = h;
    if (h < full * 0.8) {
      shrunk = true;
      if (isField(document.activeElement)) set(true);
    } else if (shrunk) {
      shrunk = false;
      full = h;
      set(false);
    }
  });
  // Drehen: neue Referenzhöhe
  screen.orientation?.addEventListener('change', () => {
    shrunk = false;
    setTimeout(() => (full = window.innerHeight), 400);
  });
}
