import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { requestPersistence, updateData, updateMeta, useData, useMeta } from '../lib/store';
import { countriesSorted, countryName, getStatic } from '../lib/geo';
import { flag, normalize } from '../lib/format';
import { derive } from '../lib/derive';
import { cloudAvailable, hasAnyData, waitForSync } from '../lib/cloud';
import { LANGS, t, tn, type Lang } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Swap } from '../ui/kit';
import { AuthPanel, useAccount } from './Account';

type Step = 'welcome' | 'account' | 'home' | 'done';

/** Einrichtung beim ersten Start: Sprache → Anmelden → Heimatland → fertig. */
export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const steps: Step[] = cloudAvailable ? ['welcome', 'account', 'home', 'done'] : ['welcome', 'home', 'done'];
  const [step, setStep] = useState<Step>('welcome');
  const [leaving, setLeaving] = useState(false);
  const i = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(steps.length - 1, i + 1)]);
  const back = () => setStep(steps[Math.max(0, i - 1)]);

  const finish = () => {
    void requestPersistence();
    setLeaving(true);
    setTimeout(() => {
      updateMeta({ onboarded: true });
      onFinish();
    }, 480);
  };

  // Nach dem Anmelden: Wer schon Reisen im Konto hat, braucht kein Heimatland mehr zu wählen
  const afterSignIn = async () => {
    await waitForSync();
    setStep(hasAnyData() ? 'done' : 'home');
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
          {steps.map((s, n) => (
            <i class={n === i ? 'on' : n < i ? 'past' : ''} key={s} />
          ))}
        </div>
        <span style={{ width: '42px' }} />
      </div>
      <div class="onb-stage">
        <Swap value={step} order={steps}>
          {step === 'welcome' && <Welcome onNext={next} />}
          {step === 'account' && <AccountStep onSignedIn={afterSignIn} onSkip={next} />}
          {step === 'home' && <HomeStep onNext={next} />}
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
          { icon: 'building', t: t('Städte sammeln'), s: t('Grosse Städte und eigene Orte direkt auf der Karte') },
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
  const litSet = useMemo(() => new Set(['CA', 'US', 'BR', 'FR', 'IT', 'ES', 'GB', 'DE', 'CH', 'GR', 'EG', 'ZA', 'IN', 'TH', 'JP', 'AU', 'NZ', 'MX', 'PE', 'NO']), []);
  return (
    <div class="onb-globe">
      <svg viewBox={`0 ${st.world.h * 0.06} ${st.world.w} ${st.world.h * 0.8}`} preserveAspectRatio="xMidYMid meet">
        {st.world.countries.map((m) => (m.d ? <path class={`cty ${m.c && litSet.has(m.c) ? 'v' : ''}`} d={m.d} /> : null))}
      </svg>
    </div>
  );
}

// ---------- 2. Anmelden ----------
function AccountStep({ onSignedIn, onSkip }: { onSignedIn: () => void; onSkip: () => void }) {
  const acc = useAccount();
  const [waiting, setWaiting] = useState(false);
  const signedIn = acc.status === 'signedIn';
  return (
    <div class="onb-page">
      <div class="onb-copy">
        <div class="onb-icon pop-in">
          <Icon name={signedIn ? 'check' : 'cloud'} />
        </div>
        <h1>{signedIn ? t('Angemeldet') : t('Melde dich an')}</h1>
        <p>
          {signedIn
            ? acc.email
            : t('Mit einem kostenlosen Konto sind deine Reisen gesichert und auf all deinen Geräten da – auch wenn du Meridian schon nutzt.')}
        </p>
      </div>
      {signedIn ? (
        <div class="onb-actions">
          <button class="btn primary block press" disabled={waiting} onClick={onSignedIn}>
            {t('Weiter')}
          </button>
        </div>
      ) : (
        <>
          <AuthPanel
            onSuccess={() => {
              setWaiting(true);
              onSignedIn();
            }}
          />
          <div class="onb-actions">
            <p class="hint" style={{ textAlign: 'center', margin: '0 0 6px' }}>
              {t('Deine Reisen werden in Zürich gespeichert und nur für dich zugänglich.')}
            </p>
            <button class="onb-skip press" onClick={onSkip}>
              {t('Ohne Konto fortfahren')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 3. Heimatland ----------
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

// ---------- 4. Fertig ----------
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
        <span>{t('Tippe auf ein Land, um es zu markieren. Halte den Finger auf die Karte gedrückt, um einen Ort hinzuzufügen. Flüge importierst du im Tab «Flüge».')}</span>
      </div>
      <div class="onb-actions" style={{ marginTop: 'auto' }}>
        <button class="btn primary block press" onClick={onFinish}>
          {t('Meridian öffnen')}
        </button>
      </div>
    </div>
  );
}
