import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { replaceData, requestPersistence, updateData, updateMeta, useData, useMeta } from '../lib/store';
import { countriesSorted, countryName, getStatic } from '../lib/geo';
import { flag, fmtInt, normalize } from '../lib/format';
import { importFlightVault, parseBackup } from '../lib/importFv';
import { cloudAvailable } from '../lib/cloud';
import { openAuth, useAccount } from './Account';
import { derive } from '../lib/derive';
import { LANGS, t, tn, type Lang } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Swap } from '../ui/kit';
import { SheetHeader, closeSheet, openSheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';

type Step = 'welcome' | 'home' | 'cities' | 'data' | 'done';
const STEPS: Step[] = ['welcome', 'home', 'cities', 'data', 'done'];

/** Einrichtung beim ersten Start. */
export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [leaving, setLeaving] = useState(false);
  const i = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, i + 1)]);
  const back = () => setStep(STEPS[Math.max(0, i - 1)]);

  const finish = () => {
    void requestPersistence();
    setLeaving(true);
    setTimeout(() => {
      updateMeta({ onboarded: true });
      onFinish();
    }, 480);
  };

  return (
    <div class={`onb ${leaving ? 'leaving' : ''}`}>
      <div class="onb-glow" />
      <div class="onb-top">
        {i > 0 && step !== 'done' ? (
          <button class="icon-btn mat press" onClick={back} aria-label={t('Zurück')}>
            <Icon name="chevL" stroke={2.3} />
          </button>
        ) : (
          <span style={{ width: '42px' }} />
        )}
        <div class="onb-dots" aria-hidden="true">
          {STEPS.map((s, n) => (
            <i class={n === i ? 'on' : n < i ? 'past' : ''} key={s} />
          ))}
        </div>
        <span style={{ width: '42px' }} />
      </div>
      <div class="onb-stage">
        <Swap value={step} order={STEPS}>
          {step === 'welcome' && <Welcome onNext={next} />}
          {step === 'home' && <HomeStep onNext={next} />}
          {step === 'cities' && <CitiesStep onNext={next} />}
          {step === 'data' && <DataStep onNext={next} />}
          {step === 'done' && <DoneStep onFinish={finish} />}
        </Swap>
      </div>
    </div>
  );
}

// ---------- 1. Willkommen + Sprache ----------
function Welcome({ onNext }: { onNext: () => void }) {
  const meta = useMeta();
  return (
    <div class="onb-page">
      <GlobeHero />
      <div class="onb-langs" role="radiogroup" aria-label={t('Sprache')}>
        {LANGS.map((l) => (
          <button class={`chip press ${meta.lang === l.code ? 'on' : ''}`} role="radio" aria-checked={meta.lang === l.code} onClick={() => updateMeta({ lang: l.code as Lang })}>
            {flag(l.cc)} {l.name}
          </button>
        ))}
      </div>
      <div class="onb-copy" key={meta.lang}>
        <h1>{t('Willkommen bei Meridian')}</h1>
        <p>{t('Deine Welt an einem Ort: Länder, Städte, Trips und Flüge, schnell und übersichtlich.')}</p>
      </div>
      <div class="onb-features stagger" key={`f${meta.lang}`}>
        {[
          { icon: 'globe', t: t('Weltkarte'), s: t('Besuchte Länder und Städte auf einen Blick') },
          { icon: 'suitcase', t: t('Trips von selbst'), s: t('Aus deinen Flügen entstehen automatisch Reisen') },
          { icon: 'shield', t: t('Deine Daten bleiben bei dir'), s: t('Ohne Konto alles auf dem Gerät, mit Konto auf allen Geräten') },
        ].map((f, n) => (
          <div class="onb-feature" style={{ '--i': String(n + 2) }}>
            <div class="lead">
              <Icon name={f.icon} />
            </div>
            <div>
              <b>{f.t}</b>
              <span>{f.s}</span>
            </div>
          </div>
        ))}
      </div>
      <div class="onb-actions">
        <button class="btn primary block press" onClick={onNext}>
          {t("Los geht's")}
        </button>
      </div>
    </div>
  );
}

/** Weltkarte, auf der nach und nach Länder aufleuchten. */
function GlobeHero() {
  const st = getStatic();
  const [lit, setLit] = useState<string[]>([]);
  const order = useMemo(() => {
    const pool = st.world.countries.filter((c) => c.c && c.d && !c.s).map((c) => c.c!);
    return pool.sort(() => Math.random() - 0.5).slice(0, 26);
  }, []);
  useEffect(() => {
    let n = 0;
    const timer = setInterval(() => {
      n++;
      setLit(order.slice(0, n));
      if (n >= order.length) clearInterval(timer);
    }, 160);
    return () => clearInterval(timer);
  }, []);
  const litSet = new Set(lit);
  return (
    <div class="onb-globe">
      <svg viewBox={`0 ${st.world.h * 0.06} ${st.world.w} ${st.world.h * 0.8}`} preserveAspectRatio="xMidYMid meet">
        {st.world.countries.map((m) => (m.d ? <path class={`cty ${m.c && litSet.has(m.c) ? 'v' : ''}`} d={m.d} /> : null))}
      </svg>
    </div>
  );
}

// ---------- 2. Heimatland ----------
function HomeStep({ onNext }: { onNext: () => void }) {
  const data = useData();
  const [q, setQ] = useState('');
  const home = data.settings.home;
  const list = useMemo(() => {
    const n = normalize(q);
    return countriesSorted().filter((c) => c.k && (!n || c.n.some((x) => normalize(x).includes(n))));
  }, [q]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'center' });
  }, []);
  const pick = (cc: string) => updateData((d) => ({ ...d, settings: { ...d.settings, home: cc } }));
  return (
    <div class="onb-page">
      <div class="onb-copy">
        <div class="onb-flag pop-in" key={home}>
          {flag(home)}
        </div>
        <h1>{t('Wo bist du zuhause?')}</h1>
        <p>{t('Trips beginnen und enden in deinem Heimatland. Es zählt auch als besucht.')}</p>
      </div>
      <label class="search" style={{ margin: '0 0 10px' }}>
        <Icon name="search" />
        <input value={q} placeholder={t('Land suchen')} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="onb-list" ref={listRef}>
        {list.map((c) => (
          <button class={`onb-option press ${c.c === home ? 'on' : ''}`} style={{ '--press': '0.98' }} onClick={() => pick(c.c)}>
            <span style={{ fontSize: '26px' }}>{flag(c.c)}</span>
            <span class="grow">{countryName(c.c)}</span>
            <span class={`check ${c.c === home ? 'on' : ''}`}>
              <Icon name="check" stroke={3} />
            </span>
          </button>
        ))}
      </div>
      <div class="onb-actions">
        <button class="btn primary block press" onClick={onNext}>
          {t('Weiter mit {c}', { c: countryName(home) })}
        </button>
      </div>
    </div>
  );
}

// ---------- 3. Städte ----------
function CitiesStep({ onNext }: { onNext: () => void }) {
  const data = useData();
  const options = [
    { v: 15000, s: t('Auch kleinere Städte') },
    { v: 50000, s: t('Empfohlen: grosse Städte, nicht jedes Dorf') },
    { v: 100000, s: t('Nur Grossstädte') },
    { v: 250000, s: t('Nur Metropolen') },
  ];
  const set = (v: number) => updateData((d) => ({ ...d, settings: { ...d.settings, cityThreshold: v } }));
  return (
    <div class="onb-page">
      <div class="onb-copy">
        <div class="onb-icon pop-in">
          <Icon name="building" />
        </div>
        <h1>{t('Welche Städte zählen?')}</h1>
        <p>{t('So bleibt deine Liste übersichtlich. Hauptstädte zählen immer, und du kannst das später ändern.')}</p>
      </div>
      <div class="onb-cards stagger">
        {options.map((o, n) => (
          <button class={`onb-option big press ${data.settings.cityThreshold === o.v ? 'on' : ''}`} style={{ '--i': String(n), '--press': '0.985' }} onClick={() => set(o.v)}>
            <span class="grow">
              <b>{t('Ab {n} Einwohnern', { n: fmtInt(o.v) })}</b>
              <span>{o.s}</span>
            </span>
            <span class={`check ${data.settings.cityThreshold === o.v ? 'on' : ''}`}>
              <Icon name="check" stroke={3} />
            </span>
          </button>
        ))}
      </div>
      <div class="onb-actions">
        <button class="btn primary block press" onClick={onNext}>
          {t('Weiter')}
        </button>
      </div>
    </div>
  );
}

// ---------- 4. Daten ----------
function DataStep({ onNext }: { onNext: () => void }) {
  const data = useData();
  const acc = useAccount();
  const csv = useRef<HTMLInputElement>(null);
  const json = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>('');

  const importCsv = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const r = await importFlightVault([...files]);
      setDone(t('{f} und {t} importiert', { f: tn(r.flightsNew, 'Flug', 'Flüge'), t: tn(r.tripsNew, 'Trip', 'Trips') }));
    } catch (e) {
      toast(t('Import fehlgeschlagen: {e}', { e: (e as Error).message }), true);
    } finally {
      setBusy(false);
    }
  };
  const importJson = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      const backup = parseBackup(await f.text());
      replaceData(backup);
      setDone(t('Sicherung geladen: {f}, {c}', { f: tn(backup.flights.length, 'Flug', 'Flüge'), c: tn(backup.cities.length, 'Stadt', 'Städte') }));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div class="onb-page">
      <div class="onb-copy">
        <div class="onb-icon pop-in">
          <Icon name="download" />
        </div>
        <h1>{t('Hast du schon Reisedaten?')}</h1>
        <p>{t('Melde dich an, importiere deine Flüge oder starte einfach so und tippe Länder auf der Karte an.')}</p>
      </div>
      <div class="onb-cards stagger">
        {cloudAvailable &&
          (acc.status === 'signedIn' ? (
            <div class="onb-option big on" style={{ '--i': '0' }}>
              <span class="lead">
                <Icon name="check" />
              </span>
              <span class="grow">
                <b>{t('Angemeldet')}</b>
                <span>{acc.email}</span>
              </span>
            </div>
          ) : (
            <button
              class="onb-option big press"
              style={{ '--i': '0', '--press': '0.985' }}
              onClick={() => openAuth('signup', () => setDone(t('Angemeldet – deine Reisen werden gesichert')))}
            >
              <span class="lead">
                <Icon name="user" />
              </span>
              <span class="grow">
                <b>{t('Konto erstellen oder anmelden')}</b>
                <span>{t('Reisen sichern und auf allen Geräten sehen – auch wenn du Meridian schon nutzt')}</span>
              </span>
              <Icon name="chevR" size={16} />
            </button>
          ))}
        <button class="onb-option big press" style={{ '--i': '1', '--press': '0.985' }} disabled={busy} onClick={() => csv.current?.click()}>
          <span class="lead">
            <Icon name="plane" />
          </span>
          <span class="grow">
            <b>{busy ? t('Importiere …') : t('FlightVault-Export')}</b>
            <span>{t('CSV-Dateien für Flüge und Trips')}</span>
          </span>
          <Icon name="chevR" size={16} />
        </button>
        <button class="onb-option big press" style={{ '--i': '2', '--press': '0.985' }} onClick={() => json.current?.click()}>
          <span class="lead">
            <Icon name="file" />
          </span>
          <span class="grow">
            <b>{t('Sicherungsdatei')}</b>
            <span>{t('Eine Meridian-Sicherung (JSON)')}</span>
          </span>
          <Icon name="chevR" size={16} />
        </button>
      </div>
      {done && (
        <div class="onb-done-chip pop-in">
          <Icon name="check" stroke={2.8} /> {done}
        </div>
      )}
      <input ref={csv} type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }} onChange={(e) => importCsv((e.currentTarget as HTMLInputElement).files)} />
      <input ref={json} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => importJson((e.currentTarget as HTMLInputElement).files)} />
      <div class="onb-actions">
        <button class="btn primary block press" onClick={onNext}>
          {done || data.flights.length || acc.status === 'signedIn' ? t('Weiter') : t('Ohne Daten starten')}
        </button>
      </div>
    </div>
  );
}

// ---------- 5. Fertig ----------
function DoneStep({ onFinish }: { onFinish: () => void }) {
  const data = useData();
  const d = derive(data);
  return (
    <div class="onb-page">
      <div class="onb-copy" style={{ marginTop: 'auto' }}>
        <div class="onb-check">
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="23" />
            <path d="M15 27l7 7 15-16" />
          </svg>
        </div>
        <h1>{t('Alles bereit')}</h1>
        <p>
          {flag(data.settings.home)} {countryName(data.settings.home)} · {tn(d.visitedCount, 'Land', 'Länder')}
          {data.flights.length ? ` · ${tn(data.flights.length, 'Flug', 'Flüge')}` : ''}
        </p>
      </div>
      <div class="onb-tip pop-in" style={{ animationDelay: '500ms' }}>
        <Icon name="sparkle" />
        <span>{t('Tippe auf der Karte ein Land an, um es als besucht oder als Wunsch zu markieren. Städte fügst du unter «Länder» hinzu.')}</span>
      </div>
      <div class="onb-actions" style={{ marginTop: 'auto' }}>
        <button class="btn primary block press" onClick={onFinish}>
          {t('Meridian öffnen')}
        </button>
      </div>
    </div>
  );
}
