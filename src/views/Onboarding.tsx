import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { requestPersistence, updateData, updateMeta, useData, useMeta } from '../lib/store';
import { countriesSorted, countryName, getStatic } from '../lib/geo';
import { flag, normalize } from '../lib/format';
import { derive } from '../lib/derive';
import { cloudAvailable, hasAnyData, waitForSync } from '../lib/cloud';
import { LANGS, t, tn } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Swap } from '../ui/kit';
import { openSheet } from '../ui/Sheet';
import { AuthPanel, useAccount } from './Account';
import { LanguageSheet } from './Profile';

type Step = 'welcome' | 'account' | 'home' | 'done';

/** Einrichtung beim ersten Start: Willkommen → Konto → Heimatland → fertig. */
export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const meta = useMeta();
  const steps: Step[] = cloudAvailable ? ['welcome', 'account', 'home', 'done'] : ['welcome', 'home', 'done'];
  const [step, setStep] = useState<Step>('welcome');
  const [leaving, setLeaving] = useState(false);
  const i = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(steps.length - 1, i + 1)]);
  const back = () => setStep(steps[Math.max(0, i - 1)]);
  const lang = LANGS.find((l) => l.code === meta.lang) ?? LANGS[0];

  const finish = () => {
    void requestPersistence();
    setLeaving(true);
    setTimeout(() => {
      updateMeta({ onboarded: true });
      onFinish();
    }, 300);
  };

  // Nach dem Anmelden: Wer schon Daten im Konto hat, braucht kein Heimatland mehr zu wählen
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
          <span class="onb-top-spacer" />
        )}
        <div class="onb-dots" aria-hidden="true">
          {steps.map((s, n) => (
            <i class={n === i ? 'on' : n < i ? 'past' : ''} key={s} />
          ))}
        </div>
        {step === 'welcome' ? (
          <button class="onb-lang press" onClick={() => openSheet(() => <LanguageSheet />)} aria-label={t('Sprache')}>
            {flag(lang.cc)} {lang.code.toUpperCase()}
            <Icon name="chevD" size={14} stroke={2.4} />
          </button>
        ) : (
          <span class="onb-top-spacer" />
        )}
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

// ---------- 1. Willkommen ----------
function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div class="onb-page">
      <GlobeHero />
      <div class="onb-copy">
        <h1>{t('Willkommen bei Meridian')}</h1>
        <p>{t('Deine Welt an einem Ort: Länder, Städte und Flüge – schnell und übersichtlich.')}</p>
      </div>
      <div class="onb-features">
        {[
          { icon: 'globe', t: t('Weltkarte'), s: t('Besuchte Länder und Städte auf einen Blick') },
          { icon: 'building', t: t('Städte sammeln'), s: t('Grosse Städte und eigene Orte direkt auf der Karte') },
          { icon: 'shield', t: t('Deine Daten bleiben bei dir'), s: t('Ohne Konto alles auf dem Gerät, mit Konto auf allen Geräten') },
        ].map((f) => (
          <div class="onb-feature">
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

/** Ruhige Weltkarte mit einigen markierten Ländern. */
function GlobeHero() {
  const st = getStatic();
  const lit = useMemo(() => new Set(['CA', 'US', 'BR', 'FR', 'IT', 'ES', 'GB', 'DE', 'CH', 'GR', 'EG', 'ZA', 'IN', 'TH', 'JP', 'AU', 'NZ', 'MX', 'PE', 'NO']), []);
  return (
    <div class="onb-globe">
      <svg viewBox={`0 ${st.world.h * 0.06} ${st.world.w} ${st.world.h * 0.8}`} preserveAspectRatio="xMidYMid meet">
        {st.world.countries.map((m) => {
          const d = m.l || m.d; // grobe Detailstufe reicht hier und ist schneller
          return d ? <path class={`cty ${m.c && lit.has(m.c) ? 'v' : ''}`} d={d} /> : null;
        })}
      </svg>
    </div>
  );
}

// ---------- 2. Konto ----------
function AccountStep({ onSignedIn, onSkip }: { onSignedIn: () => void; onSkip: () => void }) {
  const acc = useAccount();
  const [waiting, setWaiting] = useState(false);
  const signedIn = acc.status === 'signedIn';
  return (
    <div class="onb-page">
      <div class="onb-copy">
        <div class="onb-icon">
          <Icon name={signedIn ? 'check' : 'user'} />
        </div>
        <h1>{signedIn ? t('Angemeldet') : t('Dein Konto')}</h1>
        <p>{signedIn ? acc.email : t('Melde dich an, wenn du Meridian schon nutzt – oder erstelle ein kostenloses Konto. So sind deine Daten gesichert und auf allen Geräten da.')}</p>
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
    <div class="onb-page fill">
      <div class="onb-copy compact">
        <div class="onb-flag" key={home}>
          {flag(home)}
        </div>
        <h1>{t('Wo bist du zuhause?')}</h1>
        <p>{t('Dein Heimatland zählt automatisch als besucht.')}</p>
      </div>
      <label class="search" style={{ margin: '0 0 10px' }}>
        <Icon name="search" />
        <input value={q} placeholder={t('Land suchen')} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="onb-list" ref={listRef}>
        {list.map((c) => (
          <button class={`onb-option press ${c.c === home ? 'on' : ''}`} onClick={() => pick(c.c)}>
            <span style={{ fontSize: '24px' }}>{flag(c.c)}</span>
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
      <div class="onb-tip">
        <Icon name="sparkle" />
        <span>{t('Tippe auf ein Land, um es zu markieren. Halte den Finger auf die Karte gedrückt, um einen Ort hinzuzufügen. Flüge importierst du unter Profil.')}</span>
      </div>
      <div class="onb-actions">
        <button class="btn primary block press" onClick={onFinish}>
          {t('Meridian öffnen')}
        </button>
      </div>
    </div>
  );
}
