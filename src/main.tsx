import { render } from 'preact';
import '@fontsource-variable/inter';
import './styles.css';
import { App } from './App';
import { loadStatic } from './lib/geo';
import { dataStore, loadStores, metaStore, requestPersistence } from './lib/store';
import { installSpringVars } from './lib/spring';
import { installPressFeedback } from './ui/Toast';
import { startAutoBackup } from './lib/github';
import { migrateAirports } from './lib/importFv';
import { applyLang } from './lib/i18n';
import { applyTheme } from './lib/theme';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';

// Nicht in fremden Seiten einbetten lassen (Schutz vor Clickjacking)
if (import.meta.env.PROD && window.top !== window.self) {
  document.body.textContent = 'Meridian cannot be embedded.';
  throw new Error('framed');
}

installSpringVars();
installPressFeedback();
// Windows zeigt keine Flaggen-Emojis – dann eine kleine Flaggen-Schrift nachladen
polyfillCountryFlagEmojis('Twemoji Country Flags', `${import.meta.env.BASE_URL}fonts/TwemojiCountryFlags.woff2`);

async function start() {
  await Promise.all([loadStatic(), loadStores()]);
  const meta = metaStore.get();
  applyLang(meta.lang, dataStore.get().settings.home);
  applyTheme(meta.theme);
  render(<App />, document.getElementById('app')!);
  const splash = document.getElementById('splash');
  splash?.classList.add('gone');
  setTimeout(() => splash?.remove(), 500);
  if (meta.onboarded) void requestPersistence();
  startAutoBackup();
  void migrateAirports().catch(() => {});
}

start().catch((e) => {
  console.error(e);
  const splash = document.getElementById('splash');
  if (splash) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#ff8f94;padding:24px;text-align:center';
    p.textContent = `Meridian could not start: ${String(e?.message ?? e)}`;
    splash.replaceChildren(p);
  }
});
