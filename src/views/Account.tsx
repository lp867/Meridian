import { useEffect, useRef, useState } from 'preact/hooks';
import { updateMeta } from '../lib/store';
import {
  authErrorText,
  getAccount,
  resetPassword,
  runConfirmedAction,
  sendDeleteConfirmation,
  signIn,
  signInGoogle,
  signUp,
  subscribeAccount,
  type AccountState,
  type DangerAction,
} from '../lib/cloud';
import { t } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Swap } from '../ui/kit';
import { SheetHeader, closeSheet, confirmSheet, openSheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';

export function useAccount(): AccountState {
  const [s, setS] = useState(getAccount());
  useEffect(() => {
    // Stand neu lesen: Er kann sich zwischen erstem Zeichnen und Abonnieren geändert haben
    setS(getAccount());
    return subscribeAccount(setS);
  }, []);
  return s;
}

export const GoogleLogo = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

type Step = 'choose' | 'email' | 'password';

/**
 * Anmelden in Schritten: zuerst nur Google (gross) oder E-Mail.
 * Bei E-Mail erst die Adresse, dann das Passwort – nie alles auf einmal.
 * Reagiert auf die tatsächliche Anmeldung, nicht nur auf den Rückgabewert.
 */
export function AuthPanel({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'' | 'mail' | 'google' | 'reset'>('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const done = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const validMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Sobald jemand angemeldet ist, weiter – egal auf welchem Weg
  useEffect(() => {
    const go = (s: AccountState) => {
      if (s.status === 'signedIn' && !done.current) {
        done.current = true;
        onSuccess();
      }
    };
    go(getAccount());
    return subscribeAccount(go);
  }, []);

  useEffect(() => {
    const el = step === 'email' ? emailRef.current : step === 'password' ? pwRef.current : null;
    if (el) setTimeout(() => el.focus(), 320);
  }, [step]);

  const goto = (s: Step) => {
    setError('');
    setInfo('');
    setStep(s);
  };

  const google = async () => {
    setError('');
    setBusy('google');
    try {
      const ok = await signInGoogle();
      if (!ok && getAccount().status !== 'signedIn') setBusy('');
    } catch (err) {
      setError(authErrorText(err));
      setBusy('');
    }
  };

  const submit = async (e?: Event) => {
    e?.preventDefault();
    if (step === 'email') {
      if (validMail) goto('password');
      else setError(t('Ungültige E-Mail-Adresse'));
      return;
    }
    setError('');
    setBusy('mail');
    try {
      if (mode === 'signup') await signUp(email, pw);
      else await signIn(email, pw);
    } catch (err) {
      setError(authErrorText(err));
      setBusy('');
    }
  };

  const forgot = async () => {
    setError('');
    setBusy('reset');
    try {
      await resetPassword(email);
      setInfo(t('Wir haben dir eine E-Mail zum Zurücksetzen geschickt.'));
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setBusy('');
    }
  };

  const messages = (
    <>
      {error && (
        <p class="auth-msg err pop-in" role="alert">
          <Icon name="alert" size={17} /> {error}
        </p>
      )}
      {info && (
        <p class="auth-msg ok pop-in" role="status">
          <Icon name="check" size={17} /> {info}
        </p>
      )}
    </>
  );

  return (
    <div class="auth-panel">
      <Swap value={step} order={['choose', 'email', 'password']}>
        {step === 'choose' && (
          <div class="auth-step">
            <button class="btn block press auth-google big" disabled={!!busy} onClick={google}>
              <GoogleLogo size={24} />
              <span>{busy === 'google' ? t('Warte auf Google …') : t('Mit Google fortfahren')}</span>
            </button>
            <p class="auth-note">{t('Mit Google meldest du dich an oder erstellst automatisch ein Konto.')}</p>
            <div class="auth-or">
              <span>{t('oder mit E-Mail')}</span>
            </div>
            {/* Klar getrennt: bestehendes Konto oder neues Konto */}
            <div class="auth-split">
              <button
                class="btn press auth-mail"
                disabled={!!busy}
                onClick={() => {
                  setMode('signin');
                  goto('email');
                }}
              >
                {t('Anmelden')}
              </button>
              <button
                class="btn press auth-mail"
                disabled={!!busy}
                onClick={() => {
                  setMode('signup');
                  goto('email');
                }}
              >
                {t('Konto erstellen')}
              </button>
            </div>
            {messages}
          </div>
        )}

        {step === 'email' && (
          <form class="auth-step" onSubmit={submit}>
            <b class="auth-mode">{mode === 'signup' ? t('Neues Konto erstellen') : t('Mit bestehendem Konto anmelden')}</b>
            <label class="field big">
              <span>{t('Deine E-Mail-Adresse')}</span>
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellcheck={false}
                enterKeyHint="next"
                value={email}
                placeholder="name@beispiel.ch"
                onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
            {messages}
            <button type="submit" class="btn primary block press auth-submit" disabled={!validMail}>
              {t('Weiter')}
            </button>
            <button type="button" class="btn ghost block press" onClick={() => goto('choose')}>
              <Icon name="chevL" /> {t('Andere Anmeldeart')}
            </button>
          </form>
        )}

        {step === 'password' && (
          <form class="auth-step" onSubmit={submit}>
            <button type="button" class="auth-email-chip press" onClick={() => goto('email')}>
              <Icon name="mail" size={16} /> <span>{email.trim()}</span> <small>{t('ändern')}</small>
            </button>
            <label class="field big">
              <span>{mode === 'signup' ? t('Neues Passwort wählen') : t('Passwort')}</span>
              <div class="pw-wrap">
                <input
                  ref={pwRef}
                  {...({ type: show ? 'text' : 'password' } as Record<string, string>)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  enterKeyHint="go"
                  value={pw}
                  placeholder={mode === 'signup' ? t('mindestens 8 Zeichen') : ''}
                  onInput={(e) => setPw((e.currentTarget as HTMLInputElement).value)}
                />
                <button type="button" class="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? t('Passwort verbergen') : t('Passwort zeigen')}>
                  {show ? t('Verbergen') : t('Zeigen')}
                </button>
              </div>
            </label>
            {messages}
            <button type="submit" class="btn primary block press auth-submit" disabled={!!busy || pw.length < (mode === 'signup' ? 8 : 6)}>
              {busy === 'mail' ? t('Einen Moment …') : mode === 'signup' ? t('Konto erstellen') : t('Anmelden')}
            </button>
            <div class="auth-links">
              <button
                type="button"
                class="btn ghost press"
                onClick={() => {
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                  setError('');
                }}
              >
                {mode === 'signup' ? t('Ich habe schon ein Konto') : t('Neu hier? Konto erstellen')}
              </button>
              {mode === 'signin' && (
                <button type="button" class="btn ghost press" disabled={!!busy} onClick={forgot}>
                  {busy === 'reset' ? t('Sende …') : t('Passwort vergessen?')}
                </button>
              )}
            </div>
          </form>
        )}
      </Swap>
    </div>
  );
}

let authOpen = false;

/** Anmelden als Sheet (z. B. im Profil). Öffnet nie zwei Fenster übereinander. */
export function openAuth(onDone?: () => void) {
  if (authOpen) return;
  authOpen = true;
  openSheet(
    () => (
      <>
        <SheetHeader title={t('Anmelden')} />
        <div class="sheet-body">
          <p class="hint" style={{ margin: '0 20px 18px', fontSize: '15px', color: 'var(--text2)' }}>
            {t('Mit einem kostenlosen Konto sind deine Reisen gesichert und auf all deinen Geräten da.')}
          </p>
          <AuthPanel
            onSuccess={() => {
              closeSheet();
              toast(t('Angemeldet – deine Reisen werden gesichert'));
              onDone?.();
            }}
          />
          <p class="hint" style={{ textAlign: 'center', marginTop: '18px' }}>
            {t('Deine Reisen werden in Zürich gespeichert und nur für dich zugänglich.')}
          </p>
        </div>
      </>
    ),
    { tall: true, onClose: () => (authOpen = false) },
  );
}

/** Sheet: Bestätigungs-E-Mail fürs Löschen anfordern. */
export function openConfirmByMail(action: DangerAction) {
  openSheet(() => <ConfirmByMailSheet action={action} />);
}

function ConfirmByMailSheet({ action }: { action: DangerAction }) {
  const acc = useAccount();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const email = acc.status === 'signedIn' ? acc.email : '';
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await sendDeleteConfirmation(action);
      setSent(true);
    } catch (e) {
      setError(authErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SheetHeader title={action === 'delete-account' ? t('Konto löschen?') : t('Alle Daten löschen?')} />
      <div class="sheet-body">
        {!sent ? (
          <>
            <p class="hint" style={{ margin: '0 20px 14px', fontSize: '15px', color: 'var(--text2)' }}>
              {action === 'delete-account'
                ? t('Dein Konto und alle Reisen in der Cloud werden endgültig gelöscht.')
                : t('Flüge, Länder, Städte und Reisen werden gelöscht – auf diesem Gerät und in deinem Konto.')}
            </p>
            <p class="hint" style={{ margin: '0 20px 18px', fontSize: '15px', color: 'var(--text2)' }}>
              {t('Zur Sicherheit schicken wir dir zuerst einen Bestätigungslink an {e}.', { e: email })}
            </p>
            {error && (
              <p class="auth-msg err pop-in" role="alert">
                <Icon name="alert" size={17} /> {error}
              </p>
            )}
            <div class="sheet-actions">
              <button class="btn press" onClick={closeSheet}>
                {t('Abbrechen')}
              </button>
              <button class="btn danger press" disabled={busy || !email} onClick={send}>
                {busy ? t('Sende …') : t('Bestätigung senden')}
              </button>
            </div>
          </>
        ) : (
          <div class="pop-in" style={{ textAlign: 'center', padding: '6px 20px 4px' }}>
            <div class="account-cta-ico" style={{ margin: '0 auto 14px' }}>
              <Icon name="mail" />
            </div>
            <b style={{ fontSize: '17px' }}>{t('Schau in dein Postfach')}</b>
            <p class="hint" style={{ margin: '8px 0 18px', fontSize: '15px', color: 'var(--text2)' }}>
              {t('Tippe auf den Link in der E-Mail an {e}. Danach fragt Meridian ein letztes Mal nach, bevor gelöscht wird. Der Link gilt eine Stunde.', { e: email })}
            </p>
            <button class="btn primary block press" onClick={closeSheet}>
              {t('Verstanden')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Nach dem Öffnen des Bestätigungslinks: letzte Rückfrage, dann löschen. */
export async function finishConfirmedAction(action: DangerAction) {
  const ok = await confirmSheet({
    title: action === 'delete-account' ? t('Konto jetzt löschen?') : t('Alle Daten jetzt löschen?'),
    text:
      action === 'delete-account'
        ? t('Deine E-Mail ist bestätigt. Dein Konto und alle Reisen in der Cloud werden endgültig gelöscht.')
        : t('Deine E-Mail ist bestätigt. Alle Reisen werden auf diesem Gerät und in deinem Konto gelöscht.'),
    ok: t('Endgültig löschen'),
    danger: true,
  });
  if (!ok) {
    updateMeta({ pendingAction: undefined });
    return;
  }
  try {
    await runConfirmedAction(action);
    toast(action === 'delete-account' ? t('Konto gelöscht') : t('Daten gelöscht'));
  } catch (e) {
    toast(authErrorText(e), true);
  }
}
