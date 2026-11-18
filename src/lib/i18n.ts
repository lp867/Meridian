// Übersetzungen: Deutsch ist die Quellsprache, die anderen Sprachen stehen in strings.ts.
import { STRINGS } from './strings';

export type Lang = 'de' | 'en' | 'fr' | 'es';
export const LANGS: { code: Lang; name: string; cc: string }[] = [
  { code: 'de', name: 'Deutsch', cc: 'DE' },
  { code: 'en', name: 'English', cc: 'GB' },
  { code: 'fr', name: 'Français', cc: 'FR' },
  { code: 'es', name: 'Español', cc: 'ES' },
];
const IDX: Record<Lang, number> = { de: 0, en: 1, fr: 2, es: 3 };

let current: Lang = 'de';
let region = 'CH';

export const getLang = () => current;
export const langIndex = () => IDX[current];

export function applyLang(lang: Lang, home?: string) {
  current = lang;
  if (home) region = home;
  document.documentElement.lang = lang;
}

/** Sprache aus den Geräteeinstellungen, sonst Englisch. */
export function guessLang(): Lang {
  for (const l of navigator.languages ?? [navigator.language]) {
    const c = l.slice(0, 2).toLowerCase();
    if (c in IDX) return c as Lang;
  }
  return 'en';
}

/** Gebietsschema für Datum und Zahlen, z. B. de-CH oder fr-FR. */
export const locale = () => `${current}-${region}`;

const missing = new Set<string>();

export function t(de: string, vars?: Record<string, string | number>): string {
  let s = de;
  if (current !== 'de') {
    const row = STRINGS[de];
    if (row) s = row[IDX[current] - 1];
    else if (import.meta.env.DEV && !missing.has(de)) {
      missing.add(de);
      console.warn('[i18n] fehlt:', de);
    }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return s;
}

let pr: Intl.PluralRules | null = null;
let prLang = '';
/** Zahl mit passender Einzahl/Mehrzahl, z. B. tn(3, 'Land', 'Länder'). */
export function tn(n: number, one: string, many: string) {
  if (prLang !== current) {
    pr = new Intl.PluralRules(current);
    prLang = current;
  }
  return `${new Intl.NumberFormat(locale()).format(n)} ${countWord(pr!.select(n) === 'one' ? one : many)}`;
}

/** Wort ohne Zahl in passender Form. */
export function tw(n: number, one: string, many: string) {
  if (prLang !== current) {
    pr = new Intl.PluralRules(current);
    prLang = current;
  }
  return countWord(pr!.select(n) === 'one' ? one : many);
}

/** Nach Zahlen klein ("8 countries"), ausser im Deutschen. */
function countWord(de: string) {
  const w = t(de);
  return current === 'de' ? w : w.charAt(0).toLocaleLowerCase(current) + w.slice(1);
}

/** Name aus einem Sprach-Array [de, en, fr, es]. */
export const pick = (names: string[] | 0 | undefined, fallback: string) => (names && names[IDX[current]]) || fallback;
