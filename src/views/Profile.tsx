import { useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { emptyData, metaStore, replaceData, updateData, updateMeta, useData, useMeta } from '../lib/store';
import { backupJson, downloadFile, parseBackup, toCsv } from '../lib/importFv';
import { cityName, useDerived } from '../lib/derive';
import { countriesSorted, countryName } from '../lib/geo';
import { flag, fmtAgo, fmtInt, normalize, todayYmd } from '../lib/format';
import { LANGS, t, tn, type Lang } from '../lib/i18n';
import { cloudAvailable, signOutAccount, sync } from '../lib/cloud';
import { switchTheme } from '../lib/theme';
import { Icon } from '../ui/Icon';
import { LargeTitle, NavBar, Row, SectionTitle } from '../ui/kit';
import { confirmSheet, openSheet, SheetHeader, closeSheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { ChoiceSheet } from '../ui/ChoiceSheet';
import { useNav } from '../ui/Stack';
import { FlightsScreen, openDataCheck, openImport } from './Flights';
import { GoogleLogo, openAuth, openConfirmByMail, useAccount } from './Account';
import { APK_URL, inAndroidApp, isAppleMobile } from '../lib/platform';
import type { AppData, Meta } from '../lib/types';

const THRESHOLDS = [15000, 25000, 50000, 100000, 250000];
const LAYOVERS = [6, 12, 24, 48];
const THEME_LABEL: Record<Meta['theme'], string> = { system: 'System', light: 'Hell', dark: 'Dunkel' };

const Value = ({ children }: { children: ComponentChildren }) => <span class="row-value">{children}</span>;

export function ProfileScreen() {
  const data = useData();
  const meta = useMeta();
  const d = useDerived();
  const acc = useAccount();
  const nav = useNav();
  const fileInput = useRef<HTMLInputElement>(null);
  const signedIn = acc.status === 'signedIn';
  const name = data.settings.name?.trim();

  const setSetting = <K extends keyof AppData['settings']>(k: K, v: AppData['settings'][K]) =>
    updateData((dd) => ({ ...dd, settings: { ...dd.settings, [k]: v } }));

  // ---------- Sicherung ----------
  const exportJson = () => {
    downloadFile(`meridian-backup-${todayYmd()}.json`, backupJson(data));
    updateMeta({ lastExportAt: Date.now() });
    toast(t('Sicherung gespeichert'));
  };
  const importJson = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const ok = await confirmSheet({
        title: t('Sicherung einspielen?'),
        text: t('{f}, {c}. Die Daten auf diesem Gerät werden ersetzt.', { f: tn(backup.flights.length, 'Flug', 'Flüge'), c: tn(backup.cities.length, 'Stadt', 'Städte') }),
        ok: t('Einspielen'),
        danger: true,
      });
      if (!ok) return;
      replaceData(backup);
      toast(t('Sicherung eingespielt'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const exportCsv = () =>
    openSheet(() => (
      <>
        <SheetHeader title={t('Als CSV exportieren')} />
        <div class="sheet-body">
          <div class="list">
            <Row
              lead={<Icon name="flag" />}
              title={t('Länder')}
              chevron
              onClick={() => {
                const rows = [...d.countries.values()]
                  .filter((c) => c.visited || c.wish)
                  .map((c) => [c.code, countryName(c.code), c.visited ? 'visited' : 'wishlist', c.first ?? '', c.last ?? '', c.cities.length, data.countries[c.code]?.note ?? '']);
                downloadFile(`meridian-countries-${todayYmd()}.csv`, toCsv(['code', 'country', 'status', 'first_visit', 'last_visit', 'cities', 'note'], rows), 'text/csv');
                closeSheet();
              }}
            />
            <Row
              lead={<Icon name="building" />}
              title={t('Städte')}
              chevron
              onClick={() => {
                const rows = data.cities.map((c) => [c.id, cityName(c), c.cc, c.pop, c.capital ? 1 : 0, c.visits.map((v) => v.date ?? '').join(' '), c.note ?? '']);
                downloadFile(`meridian-cities-${todayYmd()}.csv`, toCsv(['id', 'city', 'country', 'population', 'capital', 'visits', 'note'], rows), 'text/csv');
                closeSheet();
              }}
            />
          </div>
        </div>
      </>
    ));

  // ---------- Konto ----------
  const syncStatus = acc.status !== 'signedIn' ? '' : acc.syncing ? t('Synchronisiere …') : meta.syncError ? meta.syncError : meta.lastSyncAt ? t('Gesichert {t}', { t: fmtAgo(meta.lastSyncAt) }) : t('Noch nicht gesichert');
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

  // ---------- Löschen ----------
  const wipe = async () => {
    if (signedIn) {
      openConfirmByMail('wipe-data'); // mit Konto: erst per E-Mail bestätigen
      return;
    }
    const ok = await confirmSheet({
      title: t('Alle Daten löschen?'),
      text: t('Flüge, Länder, Städte und Reisen auf diesem Gerät werden gelöscht.'),
      ok: t('Alles löschen'),
      danger: true,
    });
    if (!ok) return;
    replaceData({ ...emptyData(), settings: data.settings });
    toast(t('Daten gelöscht'));
  };

  const langName = LANGS.find((l) => l.code === meta.lang)?.name ?? meta.lang;

  return (
    <>
      <NavBar title={t('Profil')} />
      <LargeTitle>{t('Profil')}</LargeTitle>

      {/* Kopf: Name, Konto/Heimat, drei Kennzahlen */}
      <button class="card press profile-head" onClick={() => openSheet(() => <NameSheet />)}>
        <div class="avatar">{name ? name.slice(0, 1).toUpperCase() : flag(data.settings.home)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div class="pname">{name || t('Name hinzufügen')}</div>
          <div class="psub">{signedIn ? acc.email : `${flag(data.settings.home)} ${countryName(data.settings.home)}`}</div>
        </div>
        <Icon name="pencil" size={17} />
      </button>
      <div class="profile-stats">
        <div>
          <b class="num">{fmtInt(d.visitedCount)}</b>
          <span>{t('Länder')}</span>
        </div>
        <div>
          <b class="num">{fmtInt(data.cities.length)}</b>
          <span>{t('Städte')}</span>
        </div>
        <div>
          <b class="num">{fmtInt(data.flights.length)}</b>
          <span>{t('Flüge')}</span>
        </div>
      </div>

      {/* Flüge */}
      <SectionTitle>{t('Flüge')}</SectionTitle>
      <div class="list">
        <Row
          lead={<Icon name="plane" />}
          title={t('Meine Flüge')}
          sub={data.flights.length ? `${tn(d.stats.count, 'Flug', 'Flüge')} · ${fmtInt(d.stats.km)} km` : t('Noch keine Flüge')}
          chevron
          onClick={() => nav.push(<FlightsScreen />)}
        />
        <Row lead={<Icon name="download" />} title={t('FlightVault importieren')} chevron onClick={openImport} />
        {d.issues.length > 0 && <Row lead={<Icon name="alert" />} title={t('Datencheck')} trail={<Value>{d.issues.length}</Value>} chevron onClick={openDataCheck} />}
      </div>

      {/* Konto */}
      {cloudAvailable && (
        <>
          <SectionTitle>{t('Konto')}</SectionTitle>
          <div class="list">
            {acc.status === 'signedIn' ? (
              <>
                <Row lead={acc.provider === 'google' ? <GoogleLogo size={20} /> : <Icon name="user" />} title={acc.email || t('Angemeldet')} sub={syncStatus} />
                <Row
                  lead={<Icon name="refresh" />}
                  title={t('Jetzt synchronisieren')}
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
                <Row lead={<Icon name="logout" />} title={t('Abmelden')} onClick={logout} />
              </>
            ) : acc.status === 'loading' ? (
              <Row lead={<Icon name="cloud" />} title={t('Verbinde …')} />
            ) : (
              <Row lead={<Icon name="cloud" />} title={t('Anmelden oder Konto erstellen')} sub={t('Reisen sichern und überall sehen')} chevron onClick={() => openAuth()} />
            )}
          </div>
        </>
      )}

      {/* Einstellungen */}
      <SectionTitle>{t('Einstellungen')}</SectionTitle>
      <div class="list">
        <Row
          lead={<Icon name={meta.theme === 'light' ? 'sun' : meta.theme === 'dark' ? 'moon' : 'monitor'} />}
          title={t('Darstellung')}
          trail={<Value>{t(THEME_LABEL[meta.theme])}</Value>}
          chevron
          onClick={() => openSheet(() => <ThemeSheet />)}
        />
        <Row lead={<Icon name="languages" />} title={t('Sprache')} trail={<Value>{langName}</Value>} chevron onClick={() => openSheet(() => <LanguageSheet />)} />
        <Row
          lead={<Icon name="home" />}
          title={t('Heimatland')}
          trail={<Value>{countryName(data.settings.home)}</Value>}
          chevron
          onClick={() => openSheet(() => <HomePicker />, { tall: true })}
        />
        <Row
          lead={<Icon name="building" />}
          title={t('Städte zählen ab')}
          trail={<Value>{fmtInt(data.settings.cityThreshold)}</Value>}
          chevron
          onClick={() =>
            openSheet(() => (
              <ChoiceSheet
                title={t('Städte zählen ab')}
                hint={t('Hauptstädte zählen immer. Bereits erfasste Städte bleiben erhalten.')}
                options={THRESHOLDS.map((v) => ({ value: String(v), label: tn(v, 'Einwohner', 'Einwohner') }))}
                value={String(data.settings.cityThreshold)}
                onPick={(v) => setSetting('cityThreshold', Number(v))}
              />
            ))
          }
        />
        <Row
          lead={<Icon name="route" />}
          title={t('Umstieg statt Ziel')}
          trail={<Value>{t('unter {n} h', { n: data.settings.layoverHours })}</Value>}
          chevron
          onClick={() =>
            openSheet(() => (
              <ChoiceSheet
                title={t('Umstieg statt Ziel, wenn kürzer als')}
                hint={t('Touchdown zählt: Auch ein Land, in dem du nur umsteigst, gilt als besucht.')}
                options={LAYOVERS.map((h) => ({ value: String(h), label: tn(h, 'Stunde', 'Stunden') }))}
                value={String(data.settings.layoverHours)}
                onPick={(v) => setSetting('layoverHours', Number(v))}
              />
            ))
          }
        />
      </div>

      {/* Sicherung */}
      <SectionTitle>{t('Sicherung')}</SectionTitle>
      <div class="list">
        <Row lead={<Icon name="upload" />} title={t('Sicherung speichern')} trail={<Value>{fmtAgo(meta.lastExportAt)}</Value>} onClick={exportJson} />
        <Row lead={<Icon name="download" />} title={t('Sicherung einspielen')} onClick={() => fileInput.current?.click()} />
        <Row lead={<Icon name="file" />} title={t('Als CSV exportieren')} chevron onClick={exportCsv} />
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => importJson((e.currentTarget as HTMLInputElement).files)} />

      {/* Über */}
      <SectionTitle>{t('Über')}</SectionTitle>
      <div class="list">
        <Row lead={<Icon name="info" />} title="Meridian" trail={<Value>{__APP_VERSION__}</Value>} />
        <Row lead={<Icon name="shield" />} title={t('Datenschutz & Datenquellen')} chevron onClick={() => openSheet(() => <AboutSheet />)} />
        {/* Bewusst unauffällig hier unten: für die meisten reicht die Website bzw. «Zum Startbildschirm» */}
        {!inAndroidApp() && !isAppleMobile() && (
          <Row lead={<Icon name="phone" />} title={t('Android-App')} chevron onClick={() => openSheet(() => <AndroidSheet />)} />
        )}
      </div>

      {/* Löschen – bewusst ganz unten und getrennt */}
      <div class="list danger-zone">
        <Row lead={<Icon name="trash" />} title={t('Alle Daten löschen')} onClick={wipe} />
        {signedIn && <Row lead={<Icon name="user" />} title={t('Konto löschen')} onClick={() => openConfirmByMail('delete-account')} />}
      </div>
    </>
  );
}

// ---------- Auswahl-Sheets ----------

function ThemeSheet() {
  const meta = useMeta();
  const options: { value: Meta['theme']; icon: string }[] = [
    { value: 'system', icon: 'monitor' },
    { value: 'light', icon: 'sun' },
    { value: 'dark', icon: 'moon' },
  ];
  return (
    <>
      <SheetHeader title={t('Darstellung')} />
      <div class="sheet-body">
        <div class="list">
          {options.map((o) => (
            <Row
              lead={<Icon name={o.icon} />}
              title={t(THEME_LABEL[o.value])}
              trail={
                <span class={`check ${meta.theme === o.value ? 'on' : ''}`}>
                  <Icon name="check" stroke={3} />
                </span>
              }
              onClick={() => {
                switchTheme(o.value);
                updateMeta({ theme: o.value });
              }}
            />
          ))}
        </div>
        <p class="hint">{t('«System» folgt der Einstellung deines Geräts.')}</p>
      </div>
    </>
  );
}

export function LanguageSheet() {
  const meta = useMeta();
  return (
    <>
      <SheetHeader title={t('Sprache')} />
      <div class="sheet-body">
        <div class="list">
          {LANGS.map((l) => (
            <Row
              lead={flag(l.cc)}
              leadClass="flag"
              title={l.name}
              trail={
                <span class={`check ${meta.lang === l.code ? 'on' : ''}`}>
                  <Icon name="check" stroke={3} />
                </span>
              }
              onClick={() => {
                updateMeta({ lang: l.code as Lang });
                closeSheet();
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function AboutSheet() {
  return (
    <>
      <SheetHeader title={t('Datenschutz & Datenquellen')} />
      <div class="sheet-body">
        <p class="hint" style={{ margin: '0 20px 12px', fontSize: '15px', color: 'var(--text2)', lineHeight: 1.55 }}>
          {t('Ohne Konto bleiben alle Daten auf deinem Gerät. Mit Konto werden sie verschlüsselt übertragen und bei Google Firebase in Zürich gespeichert.')}
        </p>
        <p class="hint" style={{ margin: '0 20px', lineHeight: 1.6 }}>
          {t('Datenquellen')}: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (CC BY 4.0),{' '}
          <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>,{' '}
          <a href="https://github.com/mledoze/countries" target="_blank" rel="noreferrer">mledoze/countries</a> (ODbL),{' '}
          <a href="https://github.com/mwgg/Airports" target="_blank" rel="noreferrer">mwgg/Airports</a> (MIT), Twemoji (CC BY 4.0).
        </p>
        <p class="hint" style={{ margin: '12px 20px 0', lineHeight: 1.6 }}>
          {t('Kartenansicht Gelände und Satellit')}: <a href="https://maps.eox.at" target="_blank" rel="noreferrer">Terrain Light</a> © EOX ({t('Daten')} ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>),{' '}
          <a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless 2016</a> © EOX IT Services GmbH (CC BY 4.0, {t('enthält veränderte Copernicus-Sentinel-Daten 2016')}).{' '}
          {t('Diese Bilder werden nur geladen, wenn du die Ansicht auswählst. Den Standort fragt Meridian nur auf Knopfdruck ab, er bleibt auf deinem Gerät.')}
        </p>
      </div>
    </>
  );
}

/** APK-Download der Android-App mit kurzer Anleitung. */
function AndroidSheet() {
  return (
    <>
      <SheetHeader title={t('Android-App')} />
      <div class="sheet-body">
        <p class="apk-lead">
          {t('Meridian gibt es auch als App für Android-Handys. Sie zeigt dasselbe wie diese Website, aber im Vollbild und mit eigenem Symbol. Neue Versionen kommen automatisch.')}
        </p>
        <ol class="apk-steps">
          <li>{t('«APK herunterladen» antippen und die Datei öffnen.')}</li>
          <li>{t('Fragt Android nach, die Installation aus dieser Quelle erlauben.')}</li>
          <li>{t('«Installieren» antippen. Warnungen vor unbekannten Apps sind ausserhalb des Play Store normal.')}</li>
        </ol>
        <div class="sheet-actions">
          <a class="btn primary press" href={APK_URL} rel="noreferrer">
            <Icon name="download" />
            {t('APK herunterladen')}
          </a>
        </div>
        <p class="hint" style={{ textAlign: 'center', margin: '10px 22px 0' }}>
          {t('Für Android 8 und neuer · 0,4 MB')}
        </p>
        <p class="hint" style={{ margin: '16px 22px 0' }}>
          {t('Was du am Handy in Chrome eingetragen hast, ist in der App gleich dabei. Mit Konto auch alles von deinen anderen Geräten.')}
        </p>
      </div>
    </>
  );
}

function NameSheet() {
  const data = useData();
  const [name, setName] = useState(data.settings.name ?? '');
  const save = () => {
    updateData((dd) => ({ ...dd, settings: { ...dd.settings, name: name.trim() || undefined } }));
    closeSheet();
  };
  return (
    <>
      <SheetHeader title={t('Dein Name')} />
      <div class="sheet-body">
        <label class="field big">
          <span>{t('Name')}</span>
          <input value={name} placeholder={t('Wie sollen wir dich nennen?')} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} enterKeyHint="done" />
        </label>
        <div class="sheet-actions">
          <button class="btn primary press" onClick={save}>
            {t('Speichern')}
          </button>
        </div>
      </div>
    </>
  );
}

export function HomePicker({ onPicked }: { onPicked?: (cc: string) => void }) {
  const data = useData();
  const [q, setQ] = useState('');
  const n = normalize(q);
  const list = countriesSorted().filter((c) => c.k && (!n || c.n.some((x) => normalize(x).includes(n))));
  const pick = (cc: string) => {
    updateData((dd) => ({ ...dd, settings: { ...dd.settings, home: cc } }));
    if (onPicked) onPicked(cc);
    else closeSheet();
  };
  return (
    <>
      <SheetHeader title={t('Heimatland')} />
      <div style={{ padding: '4px 16px 10px' }}>
        <label class="search" style={{ margin: 0 }}>
          <Icon name="search" />
          <input value={q} placeholder={t('Land suchen')} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="sheet-body">
        <div class="list plain">
          {list.map((c) => (
            <Row
              lead={flag(c.c)}
              leadClass="flag"
              title={countryName(c.c)}
              trail={
                data.settings.home === c.c ? (
                  <span class="check on">
                    <Icon name="check" stroke={3} />
                  </span>
                ) : undefined
              }
              onClick={() => pick(c.c)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
