// Erkennt, ob Meridian in der Android-App läuft (Trusted Web Activity) oder auf iPhone/iPad.
// Die App startet mit ?app=android; Chrome setzt zusätzlich document.referrer auf android-app://…
// sessionStorage statt localStorage: App und Chrome teilen sich sonst denselben Speicher.

/** Download der Android-App: immer die neueste Version aus den GitHub-Releases. */
export const APK_URL = 'https://github.com/lp867/Meridian/releases/latest/download/Meridian.apk';

const KEY = 'meridian-in-android-app';

/** Beim Start aufrufen: merkt sich die App-Herkunft und entfernt ?app=android aus der Adresse. */
export function detectAndroidApp() {
  try {
    const params = new URLSearchParams(location.search);
    const fromApp = params.get('app') === 'android' || document.referrer.startsWith('android-app://');
    if (fromApp) sessionStorage.setItem(KEY, '1');
    if (params.has('app')) {
      params.delete('app');
      const q = params.toString();
      history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
    }
  } catch {
    /* ohne sessionStorage: Download bleibt sichtbar */
  }
}

export function inAndroidApp(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
