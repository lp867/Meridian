import { locale, t, tn } from './i18n';

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = locale() + tz + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale(), { timeZone: tz, ...opts });
    cache.set(key, f);
  }
  return f;
}

const ymdFmt = new Map<string, Intl.DateTimeFormat>();
/** Lokales Datum (YYYY-MM-DD) eines UTC-Zeitpunkts in einer Zeitzone. */
export function localDate(ts: number, tz: string): string {
  let f = ymdFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    ymdFmt.set(tz, f);
  }
  return f.format(new Date(ts));
}

export const localTime = (ts: number, tz: string) => dtf(tz, { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));

export const localDateLong = (ts: number, tz: string) =>
  dtf(tz, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));

const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};

export const fmtDate = (ymd?: string) =>
  ymd ? dtf('UTC', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseYmd(ymd)) : '–';

export const fmtMonthYear = (ymd: string) => dtf('UTC', { month: 'long', year: 'numeric' }).format(parseYmd(ymd));

export function fmtRange(start: string, end: string) {
  if (start === end) return fmtDate(start);
  const f = dtf('UTC', { day: 'numeric', month: 'short', year: 'numeric' });
  return f.formatRange(parseYmd(start), parseYmd(end));
}

export const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);

export const todayYmd = () => localDate(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);

const nfCache = new Map<string, Intl.NumberFormat>();
const nf = (digits: number) => {
  const key = locale() + digits;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale(), { maximumFractionDigits: digits });
    nfCache.set(key, f);
  }
  return f;
};
export const fmtInt = (n: number) => nf(0).format(n);
export const fmt1 = (n: number) => nf(1).format(n);

export function fmtPop(n: number) {
  if (n >= 1e6) return t('{n} Mio.', { n: fmt1(n / 1e6) });
  return `${fmtInt(Math.round(n / 1000))}k`;
}

export function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h ${m.toString().padStart(2, '0')}` : `${m} min`;
}

export const fmtHours = (minutes: number) => `${fmtInt(Math.round(minutes / 60))} h`;

export function fmtAgo(ts: number) {
  if (!ts) return t('noch nie');
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return t('gerade eben');
  if (s < 3600) return t('vor {n} min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('vor {n} h', { n: Math.floor(s / 3600) });
  const d = Math.floor(s / 86400);
  return d === 1 ? t('gestern') : t('vor {n} Tagen', { n: d });
}

/** Flaggen-Emoji aus ISO-2-Code. */
export const flag = (cc: string) =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🏳️';

/** Kompatibilität: plural(n, 'Land', 'Länder') übersetzt automatisch. */
export const plural = tn;

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .trim();
