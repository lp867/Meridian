// Konten und Synchronisierung über Firebase (Auth + Firestore, Standort Zürich).
// Firebase wird erst geladen, wenn jemand ein Konto nutzt – ohne Konto bleibt die App schlank.
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore/lite';
import { appCheckSiteKey, firebaseConfig } from './firebase-config';
import { dataStore, emptyData, metaStore, onDataChange, setDataFromSync, updateMeta } from './store';
import { sanitizeData } from './sanitize';
import { getLang, t } from './i18n';
import type { AppData } from './types';

export const cloudAvailable = !!firebaseConfig;

export type AccountState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; uid: string; email: string; provider: 'password' | 'google'; syncing: boolean };

// ---------- kleiner Store für den Kontostatus ----------
let state: AccountState = { status: cloudAvailable ? 'loading' : 'off' };
const subs = new Set<(s: AccountState) => void>();
const setState = (s: AccountState) => {
  state = s;
  subs.forEach((f) => f(s));
};
export const getAccount = () => state;
export const subscribeAccount = (f: (s: AccountState) => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

// ---------- Firebase nachladen ----------
type Mods = {
  authM: typeof import('firebase/auth');
  fsM: typeof import('firebase/firestore/lite');
  auth: Auth;
  db: Firestore;
};
let modsP: Promise<Mods> | null = null;
function load(): Promise<Mods> {
  if (!firebaseConfig) return Promise.reject(new Error('cloud off'));
  return (modsP ??= (async () => {
    const [{ initializeApp }, authM, fsM] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore/lite')]);
    const app = initializeApp(firebaseConfig);
    if (appCheckSiteKey) {
      // Nur Anfragen aus der echten App zulassen (Schutz vor Bots und fremden Skripten)
      const ac = await import('firebase/app-check');
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    const auth = authM.initializeAuth(app, {
      persistence: [authM.indexedDBLocalPersistence, authM.browserLocalPersistence],
      popupRedirectResolver: authM.browserPopupRedirectResolver,
    });
    auth.languageCode = getLang();
    const db = fsM.getFirestore(app);
    authM.onAuthStateChanged(auth, (u) => onUser(u));
    return { authM, fsM, auth, db };
  })());
}

function providerOf(u: User): 'password' | 'google' {
  return u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password';
}

function onUser(u: User | null) {
  if (!u) {
    setState({ status: 'signedOut' });
    return;
  }
  const m = metaStore.get();
  if (m.accountUid !== u.uid) {
    // anderes Konto als zuletzt: Sync-Stand zurücksetzen
    updateMeta({ accountUid: u.uid, accountEmail: u.email ?? '', syncRemote: 0, syncLocal: 0, syncError: '' });
  } else if (m.accountEmail !== (u.email ?? '')) updateMeta({ accountEmail: u.email ?? '' });
  setState({ status: 'signedIn', uid: u.uid, email: u.email ?? '', provider: providerOf(u), syncing: false });
  void sync();
}

/**
 * Beim Start: Sitzung immer wiederherstellen. Auch wenn die App beim letzten Mal nichts von der
 * Anmeldung mitbekommen hat (z. B. Google-Fenster), merkt Firebase sich die Sitzung –
 * deshalb wird Firebase nach dem ersten Bild immer kurz im Hintergrund geladen.
 */
export function initCloud() {
  if (!cloudAvailable) return;
  const known = !!metaStore.get().accountUid;
  if (!known) setState({ status: 'signedOut' });
  const restore = () =>
    load()
      .then(({ authM, auth }) => authM.getRedirectResult(auth).catch(() => null))
      .catch(() => setState({ status: 'signedOut' }));
  if (known) void restore();
  else
    // Firebase merkt sich Sitzungen in "firebaseLocalStorageDb" – nur dann im Hintergrund nachsehen
    setTimeout(async () => {
      const dbs = (await indexedDB.databases?.().catch(() => [])) ?? [];
      if (dbs.some((d) => d.name === 'firebaseLocalStorageDb')) void restore();
    }, 1200);

  let timer = 0;
  const later = (ms: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void sync(), ms);
  };
  onDataChange(() => later(3000));
  window.addEventListener('online', () => later(1000));
  document.addEventListener('visibilitychange', () => later(document.visibilityState === 'visible' ? 300 : 0));
}

// ---------- Anmelden ----------
export function authErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return t('Ungültige E-Mail-Adresse');
    case 'auth/missing-password':
    case 'auth/weak-password':
      return t('Das Passwort braucht mindestens 6 Zeichen');
    case 'auth/email-already-in-use':
      return t('Für diese E-Mail gibt es schon ein Konto. Melde dich an.');
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('E-Mail oder Passwort stimmt nicht');
    case 'auth/too-many-requests':
      return t('Zu viele Versuche. Bitte warte kurz.');
    case 'auth/network-request-failed':
      return t('Keine Verbindung');
    case 'auth/unauthorized-domain':
      return t('Diese Adresse ist im Firebase-Projekt nicht freigegeben');
    case 'auth/account-exists-with-different-credential':
      return t('Diese E-Mail ist schon mit einer anderen Anmeldeart verknüpft');
    case 'auth/requires-recent-login':
      return t('Bitte melde dich zur Sicherheit nochmals an');
    default:
      return t('Anmeldung fehlgeschlagen ({c})', { c: code || String((e as Error)?.message ?? e) });
  }
}
const silent = (e: unknown) => ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes((e as { code?: string })?.code ?? '');

export async function signUp(email: string, password: string) {
  const { authM, auth } = await load();
  auth.languageCode = getLang();
  await authM.createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signIn(email: string, password: string) {
  const { authM, auth } = await load();
  await authM.signInWithEmailAndPassword(auth, email.trim(), password);
}

/** Wartet, bis jemand angemeldet ist (oder die Zeit abläuft). */
function waitForSignIn(ms: number): Promise<boolean> {
  if (state.status === 'signedIn') return Promise.resolve(true);
  return new Promise((resolve) => {
    const off = subscribeAccount((s) => {
      if (s.status === 'signedIn') {
        off();
        clearTimeout(timer);
        resolve(true);
      }
    });
    const timer = setTimeout(() => {
      off();
      resolve(false);
    }, ms);
  });
}

/**
 * Google-Anmeldung als Popup; wo Popups nicht gehen, per Weiterleitung.
 * Chrome meldet das Google-Fenster manchmal fälschlich als «geschlossen», obwohl die
 * Anmeldung geklappt hat – deshalb danach noch kurz auf die echte Anmeldung warten.
 */
export async function signInGoogle(): Promise<boolean> {
  const { authM, auth } = await load();
  auth.languageCode = getLang();
  const provider = new authM.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await authM.signInWithPopup(auth, provider);
    return true;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      updateMeta({ accountUid: metaStore.get().accountUid || 'pending' });
      await authM.signInWithRedirect(auth, provider);
      return false;
    }
    if (silent(e)) {
      // Ergebnis kann trotzdem noch eintreffen
      authM.getRedirectResult(auth).catch(() => null);
      return waitForSignIn(6000);
    }
    throw e;
  }
}

/** Bis die laufende Synchronisierung fertig ist (z. B. direkt nach dem Anmelden). */
export async function waitForSync() {
  await new Promise((r) => setTimeout(r, 0));
  await (running ?? Promise.resolve());
}

export const hasAnyData = () => hasContent(dataStore.get());

// ---------- Löschen nur nach Bestätigung per E-Mail ----------
export type DangerAction = 'delete-account' | 'wipe-data';

/** Schickt einen Bestätigungslink an die E-Mail des Kontos. */
export async function sendDeleteConfirmation(action: DangerAction) {
  const { authM, auth } = await load();
  const u = auth.currentUser;
  if (!u?.email) throw new Error(t('Nicht angemeldet'));
  auth.languageCode = getLang();
  const url = `${location.origin}${location.pathname}?confirm=${action}`;
  await authM.sendSignInLinkToEmail(auth, u.email, { url, handleCodeInApp: true });
  updateMeta({ pendingAction: { action, email: u.email, at: Date.now() } });
}

/**
 * Prüft beim Start, ob die App über einen Bestätigungslink geöffnet wurde.
 * Gibt die bestätigte Aktion zurück (die Ausführung bestätigt die Person danach in der App).
 */
export async function consumeConfirmationLink(): Promise<DangerAction | null> {
  const params = new URLSearchParams(location.search);
  if (!cloudAvailable || !params.get('oobCode')) return null;
  const clean = () => history.replaceState(history.state, '', location.pathname);
  try {
    const { authM, auth } = await load();
    if (!authM.isSignInWithEmailLink(auth, location.href)) return null;
    await auth.authStateReady();
    const pending = metaStore.get().pendingAction;
    const u = auth.currentUser;
    if (!pending || Date.now() - pending.at > 3600_000 || !u || u.email !== pending.email) {
      clean();
      throw new Error(t('Dieser Link ist abgelaufen oder gehört zu einem anderen Gerät. Starte das Löschen bitte nochmals.'));
    }
    await authM.reauthenticateWithCredential(u, authM.EmailAuthProvider.credentialWithLink(pending.email, location.href));
    clean();
    return pending.action;
  } catch (e) {
    clean();
    throw e instanceof Error && !(e as { code?: string }).code ? e : new Error(authErrorText(e));
  }
}

/** Führt die bestätigte Aktion aus. */
export async function runConfirmedAction(action: DangerAction) {
  updateMeta({ pendingAction: undefined });
  if (action === 'wipe-data') {
    setDataFromSync({ ...emptyData(), settings: dataStore.get().settings, updatedAt: Date.now() });
    const { fsM, db, auth } = await load();
    const u = auth.currentUser;
    if (u) {
      const d = dataStore.get();
      await fsM.setDoc(fsM.doc(db, 'users', u.uid), { data: JSON.stringify(d), updatedAt: d.updatedAt, version: 1 });
      updateMeta({ syncRemote: d.updatedAt, syncLocal: d.updatedAt, lastSyncAt: Date.now() });
    }
  } else {
    await deleteAccount();
  }
}

export async function resetPassword(email: string) {
  const { authM, auth } = await load();
  auth.languageCode = getLang();
  await authM.sendPasswordResetEmail(auth, email.trim());
}

/** Abmelden: vorher sichern, danach Daten von diesem Gerät entfernen. */
export async function signOutAccount() {
  const { authM, auth } = await load();
  await sync().catch(() => {});
  if (metaStore.get().syncError) throw new Error(t('Noch nicht alles gesichert. Prüfe die Verbindung und versuche es nochmals.'));
  await authM.signOut(auth);
  setDataFromSync({ ...emptyData(), settings: dataStore.get().settings });
  updateMeta({ accountUid: '', accountEmail: '', syncRemote: 0, syncLocal: 0, lastSyncAt: 0, syncError: '' });
}

/** Konto und Cloud-Daten löschen (nur nach Bestätigung per E-Mail-Link aufrufen). */
async function deleteAccount() {
  const { authM, fsM, auth, db } = await load();
  const u = auth.currentUser;
  if (!u) throw new Error(t('Nicht angemeldet'));
  await fsM.deleteDoc(fsM.doc(db, 'users', u.uid));
  await authM.deleteUser(u);
  updateMeta({ accountUid: '', accountEmail: '', syncRemote: 0, syncLocal: 0, lastSyncAt: 0, syncError: '' });
}

// ---------- Synchronisieren ----------
const hasContent = (d: AppData) =>
  d.flights.length + d.cities.length + d.manualTrips.length + Object.keys(d.countries).length + d.fvTrips.length > 0;

/** Führt zwei Datenstände zusammen (z. B. beim ersten Anmelden auf einem Gerät mit Daten). */
export function mergeData(a: AppData, b: AppData): AppData {
  const [newer, older] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  const byId = <T>(x: T[], y: T[], key: (v: T) => string | number) => {
    const m = new Map<string | number, T>();
    for (const v of x) m.set(key(v), v);
    for (const v of y) m.set(key(v), v); // y = neuer gewinnt
    return [...m.values()];
  };
  const cities = byId(older.cities, newer.cities, (c) => c.id).map((c) => {
    const o = older.cities.find((x) => x.id === c.id);
    if (!o) return c;
    const seen = new Set(c.visits.map((v) => `${v.date}|${v.tripId}`));
    return { ...c, visits: [...c.visits, ...o.visits.filter((v) => !seen.has(`${v.date}|${v.tripId}`))] };
  });
  const union = <T>(x: T[], y: T[]) => [...new Set([...x, ...y])];
  return {
    ...newer,
    flights: byId(older.flights, newer.flights, (f) => f.id).sort((x, y) => x.depTs - y.depTs),
    fvTrips: byId(older.fvTrips, newer.fvTrips, (f) => f.id),
    airports: { ...older.airports, ...newer.airports },
    countries: { ...older.countries, ...newer.countries },
    cities,
    manualTrips: byId(older.manualTrips, newer.manualTrips, (m) => m.id),
    tripOverrides: { ...older.tripOverrides, ...newer.tripOverrides },
    tripSplits: union(older.tripSplits, newer.tripSplits),
    tripJoins: union(older.tripJoins, newer.tripJoins),
    dismissedSuggestions: union(older.dismissedSuggestions, newer.dismissedSuggestions),
    settings: newer.settings,
  };
}

let running: Promise<void> | null = null;
let again = false;

export function sync(): Promise<void> {
  if (state.status !== 'signedIn') return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const uid = state.status === 'signedIn' ? state.uid : '';
    if (state.status === 'signedIn') setState({ ...state, syncing: true });
    try {
      const { fsM, db } = await load();
      const ref = fsM.doc(db, 'users', uid);
      const push = async (d: AppData) => {
        await fsM.setDoc(ref, { data: JSON.stringify(d), updatedAt: d.updatedAt, version: 1 });
      };
      const snap = await fsM.getDoc(ref);
      const local = dataStore.get();
      const m = metaStore.get();
      let mark = 0;

      if (!snap.exists()) {
        const d = { ...local, updatedAt: local.updatedAt || Date.now() };
        await push(d);
        mark = d.updatedAt;
      } else {
        const raw = snap.data() as { data?: string; updatedAt?: number };
        const remoteAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
        if (remoteAt === m.syncRemote) {
          // In der Cloud hat sich nichts geändert – nur eigene Änderungen hochladen
          if (local.updatedAt !== m.syncLocal) await push(local);
          mark = local.updatedAt;
        } else {
          const remote = { ...sanitizeData(JSON.parse(raw.data ?? '{}')), updatedAt: remoteAt };
          const localChanged = local.updatedAt !== m.syncLocal && hasContent(local);
          if (!localChanged) {
            setDataFromSync(remote);
            mark = remote.updatedAt;
          } else {
            const merged = { ...mergeData(local, remote), updatedAt: Date.now() };
            setDataFromSync(merged);
            await push(merged);
            mark = merged.updatedAt;
          }
        }
      }
      updateMeta({ syncRemote: mark, syncLocal: mark, lastSyncAt: Date.now(), syncError: '' });
    } catch (e) {
      const msg = !navigator.onLine || (e as { code?: string })?.code === 'unavailable' ? t('Keine Verbindung') : (e as Error)?.message ?? String(e);
      updateMeta({ syncError: msg });
    } finally {
      if (state.status === 'signedIn') setState({ ...state, syncing: false });
      running = null;
      if (again) {
        again = false;
        void sync();
      }
    }
  })();
  return running;
}
