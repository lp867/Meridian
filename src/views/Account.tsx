import { useEffect, useState } from 'preact/hooks';
import { metaStore, useMeta } from '../lib/store';
import {
  authErrorText,
  cloudAvailable,
  deleteAccount,
  getAccount,
  resetPassword,
  signIn,
  signInGoogle,
  signOutAccount,
  signUp,
  subscribeAccount,
  sync,
  type AccountState,
} from '../lib/cloud';
import { fmtAgo } from '../lib/format';
import { t } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { Row, SectionTitle, Segmented } from '../ui/kit';
import { SheetHeader, closeSheet, confirmSheet, openSheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';

export function useAccount(): AccountState {
  const [s, setS] = useState(getAccount());
  useEffect(() => subscribeAccount(setS), []);
  return s;
}

const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/** Anmelden / Registrieren in einem Sheet – mit grossen, gut lesbaren Feldern. */
export function openAuth(initial: 'signin' | 'signup' = 'signup', onDone?: () => void) {
  openSheet(() => <AuthSheet initial={initial} onDone={onDone} />, { tall: true });
}

function AuthSheet({ initial, onDone }: { initial: 'signin' | 'signup'; onDone?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initial);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'' | 'mail' | 'google' | 'reset'>('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const validMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const finish = () => {
    closeSheet();
    toast(t('Angemeldet – deine Reisen werden gesichert'));
    onDone?.();
  };

  const submit = async (e?: Event) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    setBusy('mail');
    try {
      if (mode === 'signup') await signUp(email, pw);
      else await signIn(email, pw);
      finish();
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setBusy('');
    }
  };

  const google = async () => {
    setError('');
    setBusy('google');
    try {
      if (await signInGoogle()) finish();
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setBusy('');
    }
  };

  const forgot = async () => {
    setError('');
    if (!validMail) {
      setError(t('Gib zuerst deine E-Mail-Adresse ein'));
      return;
    }
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

  return (
    <>
      <SheetHeader title={mode === 'signup' ? t('Konto erstellen') : t('Anmelden')} />
      <div class="sheet-body">
        <div style={{ margin: '0 16px 16px' }}>
          <Segmented
            value={mode}
            onChange={(v) => {
              setMode(v);
              setError('');
              setInfo('');
            }}
            options={[
              { value: 'signup', label: t('Neu hier') },
              { value: 'signin', label: t('Ich habe ein Konto') },
            ]}
          />
        </div>
        <div style={{ margin: '0 16px' }}>
          <button class="btn block press auth-google" disabled={!!busy} onClick={google}>
            <GoogleLogo /> {busy === 'google' ? t('Verbinde …') : t('Mit Google fortfahren')}
          </button>
        </div>
        <div class="auth-or">
          <span>{t('oder mit E-Mail')}</span>
        </div>
        <form onSubmit={submit}>
          <label class="field big">
            <span>{t('E-Mail')}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellcheck={false}
              value={email}
              placeholder="name@beispiel.ch"
              onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="field big">
            <span>{t('Passwort')}</span>
            <div class="pw-wrap">
              <input
                {...({ type: show ? 'text' : 'password' } as Record<string, string>)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={pw}
                placeholder={mode === 'signup' ? t('mindestens 6 Zeichen') : ''}
                onInput={(e) => setPw((e.currentTarget as HTMLInputElement).value)}
              />
              <button type="button" class="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? t('Passwort verbergen') : t('Passwort zeigen')}>
                {show ? t('Verbergen') : t('Zeigen')}
              </button>
            </div>
          </label>
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
          <div class="sheet-actions" style={{ marginTop: '6px' }}>
            <button type="submit" class="btn primary press auth-submit" disabled={!!busy || !validMail || pw.length < 6}>
              {busy === 'mail' ? t('Einen Moment …') : mode === 'signup' ? t('Konto erstellen') : t('Anmelden')}
            </button>
          </div>
        </form>
        {mode === 'signin' && (
          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <button class="btn ghost press" disabled={!!busy} onClick={forgot}>
              {busy === 'reset' ? t('Sende …') : t('Passwort vergessen?')}
            </button>
          </div>
        )}
        <p class="hint" style={{ textAlign: 'center' }}>
          {t('Deine Reisen werden in Zürich gespeichert und nur für dich zugänglich.')}
        </p>
      </div>
    </>
  );
}

/** Konto-Bereich im Profil. */
export function AccountSection() {
  const acc = useAccount();
  const meta = useMeta();
  if (!cloudAvailable || acc.status === 'off') return null;

  if (acc.status === 'loading') {
    return (
      <>
        <SectionTitle>{t('Konto')}</SectionTitle>
        <div class="list">
          <Row lead={<Icon name="cloud" />} title={t('Verbinde …')} />
        </div>
      </>
    );
  }

  if (acc.status === 'signedOut') {
    return (
      <>
        <SectionTitle>{t('Konto')}</SectionTitle>
        <div class="card account-cta">
          <div class="account-cta-ico">
            <Icon name="cloud" />
          </div>
          <b>{t('Reisen sichern und überall sehen')}</b>
          <p>{t('Mit einem kostenlosen Konto sind deine Reisen gesichert und auf all deinen Geräten da.')}</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button class="btn primary press" style={{ flex: 1 }} onClick={() => openAuth('signup')}>
              {t('Konto erstellen')}
            </button>
            <button class="btn press" style={{ flex: 1 }} onClick={() => openAuth('signin')}>
              {t('Anmelden')}
            </button>
          </div>
        </div>
      </>
    );
  }

  const status = acc.syncing
    ? t('Synchronisiere …')
    : meta.syncError
      ? meta.syncError
      : meta.lastSyncAt
        ? t('Gesichert {t}', { t: fmtAgo(meta.lastSyncAt) })
        : t('Noch nicht gesichert');

  const logout = async () => {
    const ok = await confirmSheet({
      title: t('Abmelden?'),
      text: t('Deine Reisen bleiben im Konto gespeichert. Auf diesem Gerät werden sie entfernt, bis du dich wieder anmeldest.'),
      ok: t('Abmelden'),
    });
    if (!ok) return;
    try {
      await signOutAccount();
      toast(t('Abgemeldet'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <>
      <SectionTitle>{t('Konto')}</SectionTitle>
      <div class="list">
        <Row
          lead={acc.provider === 'google' ? <GoogleLogo /> : <Icon name="user" />}
          title={acc.email || t('Angemeldet')}
          sub={status}
          trail={<span class={`badge ${meta.syncError ? 'warn' : 'ok'}`}>{meta.syncError ? t('Fehler') : t('aktiv')}</span>}
        />
        <Row
          lead={<Icon name="refresh" />}
          title={acc.syncing ? t('Synchronisiere …') : t('Jetzt synchronisieren')}
          onClick={
            acc.syncing
              ? undefined
              : () =>
                  void sync().then(() => {
                    const err = metaStore.get().syncError;
                    toast(err || t('Synchronisiert'), !!err);
                  })
          }
        />
        <Row lead={<Icon name="chevL" />} title={t('Abmelden')} onClick={logout} />
      </div>
    </>
  );
}

/** Ganz unten im Profil: Konto löschen (Pflicht für App-Stores). */
export function DeleteAccountButton() {
  const acc = useAccount();
  if (acc.status !== 'signedIn') return null;
  return (
    <div style={{ margin: '12px 16px 0' }}>
      <button class="btn danger block press" onClick={() => openSheet(() => <DeleteAccountSheet provider={acc.provider} />)}>
        <Icon name="trash" /> {t('Konto löschen')}
      </button>
    </div>
  );
}

function DeleteAccountSheet({ provider }: { provider: 'password' | 'google' }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount(provider === 'password' ? pw : undefined);
      closeSheet();
      toast(t('Konto gelöscht'));
    } catch (e) {
      setError(authErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SheetHeader title={t('Konto löschen?')} />
      <div class="sheet-body">
        <p class="hint" style={{ margin: '0 20px 16px', fontSize: '15px', color: 'var(--text2)' }}>
          {t('Dein Konto und alle Reisen in der Cloud werden endgültig gelöscht. Auf diesem Gerät bleiben die Daten, bis du sie unter «Alle Daten löschen» entfernst.')}
        </p>
        {provider === 'password' && (
          <label class="field big">
            <span>{t('Zur Bestätigung dein Passwort')}</span>
            <input type="password" autoComplete="current-password" value={pw} onInput={(e) => setPw((e.currentTarget as HTMLInputElement).value)} />
          </label>
        )}
        {error && (
          <p class="auth-msg err pop-in" role="alert">
            <Icon name="alert" size={17} /> {error}
          </p>
        )}
        <div class="sheet-actions">
          <button class="btn press" onClick={closeSheet}>
            {t('Abbrechen')}
          </button>
          <button class="btn danger press" disabled={busy || (provider === 'password' && pw.length < 6)} onClick={run}>
            {busy ? t('Lösche …') : t('Endgültig löschen')}
          </button>
        </div>
      </div>
    </>
  );
}
