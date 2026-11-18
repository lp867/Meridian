import { useEffect, useRef, useState } from 'preact/hooks';
import { TabBar, TABS, type TabId } from './ui/TabBar';
import { Stack, navRegistry, type Nav } from './ui/Stack';
import { SheetHost } from './ui/Sheet';
import { ToastHost } from './ui/Toast';
import { MapScreen } from './views/MapScreen';
import { CountriesScreen } from './views/Countries';
import { ProfileScreen } from './views/Profile';
import { Onboarding } from './views/Onboarding';
import { useBackupWarning } from './views/shared';
import { finishConfirmedAction } from './views/Account';
import { consumeConfirmationLink } from './lib/cloud';
import { onShowCitiesOnMap } from './lib/mapEvents';
import { toast } from './ui/Toast';
import { useData, useMeta } from './lib/store';
import { applyLang } from './lib/i18n';
import { applyTheme } from './lib/theme';

const ROOTS: Record<TabId, () => preact.JSX.Element> = {
  map: () => <MapScreen />,
  countries: () => <CountriesScreen />,
  profile: () => <ProfileScreen />,
};

export function App() {
  const meta = useMeta();
  const data = useData();
  // Sprache vor dem Rendern setzen, damit alle Texte passen
  applyLang(meta.lang, data.settings.home);
  useEffect(() => applyTheme(meta.theme), [meta.theme]);
  // Wurde die App über einen Bestätigungslink (Löschen) geöffnet?
  useEffect(() => {
    consumeConfirmationLink()
      .then((action) => action && finishConfirmedAction(action))
      .catch((e) => toast((e as Error).message, true));
  }, []);

  const [tab, setTab] = useState<TabId>('map');
  const [entering, setEntering] = useState<TabId | null>(null);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const navs = useRef<Partial<Record<TabId, Nav>>>({});
  const warn = useBackupWarning();
  navRegistry.active = navs.current[tab] ?? null;

  const select = (next: TabId) => {
    if (next === tab) {
      navs.current[next]?.popToRoot();
      return;
    }
    // Unterseiten des verlassenen Tabs schliessen, damit "Zurück" eindeutig bleibt
    if (navs.current[tab]?.depth()) navs.current[tab]?.popToRoot();
    setTab(next);
    setEntering(next);
  };
  // «Auf der Karte wählen» von anderen Bildschirmen: zur Karte wechseln
  useEffect(() => onShowCitiesOnMap(() => select('map')));

  if (!meta.onboarded) {
    return (
      <>
        <Onboarding onFinish={() => setJustOnboarded(true)} />
        <SheetHost />
        <ToastHost />
      </>
    );
  }

  return (
    <>
      <div class={justOnboarded ? 'app-enter' : ''} style={{ position: 'absolute', inset: 0 }}>
        {TABS.map(({ id }) => (
          <div
            key={id}
            class={`pane ${id === tab ? 'active' : ''} ${entering === id ? 'tab-in' : ''}`}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setEntering(null);
            }}
          >
            <Stack
              root={ROOTS[id]()}
              navRef={(n) => {
                navs.current[id] = n;
                if (id === tab) navRegistry.active = n;
              }}
            />
          </div>
        ))}
      </div>
      <TabBar active={tab} onSelect={select} badge={warn ? 'profile' : null} />
      <SheetHost />
      <ToastHost />
    </>
  );
}
