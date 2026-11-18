// Sicherung der App-Daten in ein (privates) GitHub-Repo über die REST-API.
// Der Token bleibt nur auf diesem Gerät und landet nie in der Sicherung selbst.
import { backupJson, parseBackup } from './importFv';
import { dataStore, metaStore, onDataChange, updateMeta } from './store';
import type { AppData } from './types';
import { t } from './i18n';

export const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
// Dateipfad im Repo: Buchstaben, Ziffern, Leerzeichen, . _ - /, aber keine "."- oder ".."-Abschnitte
const PATH_RE = /^(?!.*(^|\/)\.\.?(\/|$))[\w .\/-]{1,200}$/;

function api(repo: string, path: string) {
  const r = repo.trim();
  const p = path.trim().replace(/^\/+/, '');
  if (!REPO_RE.test(r) || r.split('/').some((x) => x === '.' || x === '..')) throw new Error(t('Ungültiger Repo-Name'));
  if (!PATH_RE.test(p)) throw new Error(t('Ungültiger Dateiname'));
  return `https://api.github.com/repos/${r}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
}

function headers(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export const githubConfigured = () => {
  const m = metaStore.get();
  return !!(REPO_RE.test(m.githubRepo.trim()) && m.githubToken);
};

async function explain(r: Response) {
  if (r.status === 401) return t('Token ungültig oder abgelaufen');
  if (r.status === 403) return t('Token hat keine Schreibrechte für dieses Repo');
  if (r.status === 404) return t('Repo nicht gefunden (Name prüfen, Token-Zugriff auf das Repo?)');
  if (r.status === 409) return t('Konflikt beim Schreiben – bitte nochmals versuchen');
  try {
    return (await r.json()).message ?? t('Fehler {n}', { n: r.status });
  } catch {
    return t('Fehler {n}', { n: r.status });
  }
}

/** Sicherheitsnetz: Reisedaten nie in ein öffentliches Repo schreiben. */
async function ensurePrivate(repo: string, token: string) {
  api(repo, 'x'); // prüft den Repo-Namen
  const r = await fetch(`https://api.github.com/repos/${repo.trim()}`, { headers: headers(token), cache: 'no-store' });
  if (!r.ok) throw new Error(await explain(r));
  const info = (await r.json()) as { private?: boolean };
  if (info.private !== true) throw new Error(t('Das Repo ist öffentlich. Aus Datenschutzgründen sichert Meridian nur in private Repos.'));
}

async function currentSha(repo: string, path: string, token: string): Promise<string | undefined> {
  const r = await fetch(api(repo, path), { headers: headers(token), cache: 'no-store' });
  if (r.status === 404) return undefined; // Datei (oder ganzes Repo) noch leer
  if (!r.ok) throw new Error(await explain(r));
  return (await r.json()).sha;
}

let running: Promise<void> | null = null;

export async function backupToGithub(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const m = metaStore.get();
    const data = dataStore.get();
    try {
      await ensurePrivate(m.githubRepo, m.githubToken);
      const sha = await currentSha(m.githubRepo, m.githubPath, m.githubToken);
      const stamp = new Date().toLocaleString('de-CH');
      const r = await fetch(api(m.githubRepo, m.githubPath), {
        method: 'PUT',
        headers: { ...headers(m.githubToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Backup ${stamp}`, content: toBase64(backupJson(data)), ...(sha ? { sha } : {}) }),
      });
      if (!r.ok) throw new Error(await explain(r));
      updateMeta({ lastBackupAt: Date.now(), lastBackupError: '', backedUpVersion: data.updatedAt });
    } catch (e) {
      const msg = e instanceof TypeError ? t('Keine Verbindung') : (e as Error).message;
      updateMeta({ lastBackupError: msg });
      throw new Error(msg);
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function restoreFromGithub(): Promise<AppData> {
  const m = metaStore.get();
  const r = await fetch(api(m.githubRepo, m.githubPath), {
    headers: { ...headers(m.githubToken), Accept: 'application/vnd.github.raw+json' },
    cache: 'no-store',
  });
  if (r.status === 404) throw new Error(t('Im Repo gibt es noch keine Sicherung'));
  if (!r.ok) throw new Error(await explain(r));
  const text = await r.text();
  try {
    return parseBackup(text);
  } catch {
    // Fallback, falls der Server doch JSON mit base64 liefert
    return parseBackup(fromBase64(JSON.parse(text).content));
  }
}

/** Sichert automatisch, sobald sich Daten geändert haben (gebündelt). */
export function startAutoBackup() {
  let timer = 0;
  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const m = metaStore.get();
      if (!m.autoBackup || !githubConfigured() || !navigator.onLine) return;
      if (m.backedUpVersion === dataStore.get().updatedAt) return;
      backupToGithub().catch(() => {
        /* Fehler steht in den Einstellungen */
      });
    }, delay);
  };
  onDataChange(() => schedule(20000));
  window.addEventListener('online', () => schedule(3000));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') schedule(0);
  });
  schedule(5000);
}
