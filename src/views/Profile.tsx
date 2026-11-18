import { useEffect, useRef, useState } from 'preact/hooks';
import { emptyData, replaceData, requestPersistence, updateData, updateMeta, useData, useMeta } from '../lib/store';
import { AccountSection, DeleteAccountButton, openConfirmByMail, useAccount } from './Account';
import { switchTheme } from '../lib/theme';
import { backupJson, downloadFile, parseBackup, toCsv } from '../lib/importFv';
import { cityName, useDerived } from '../lib/derive';
import { countriesSorted, countryName } from '../lib/geo';
import { flag, fmtAgo, fmtInt, normalize, todayYmd } from '../lib/format';
import { LANGS, t, tn, tw, type Lang } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { AnimatedNumber, Chip, LargeTitle, NavBar, Row, SectionTitle, Segmented, Toggle, stagger } from '../ui/kit';
import { confirmSheet, openSheet, SheetHeader, closeSheet } from '../ui/Sheet';
import { toast } from '../ui/Toast';
import { openDataCheck, openImport } from './Flights';
import { useBackupWarning } from './shared';
import type { AppData, Meta } from '../lib/types';

const THRESHOLDS = [15000, 25000, 50000, 100000, 250000, 500000];
const LAYOVERS = [6, 12, 24, 48];

export function ProfileScreen() {
  const data = useData();
  const meta = useMeta();
  const d = useDerived();
  const warn = useBackupWarning();
  const acc = useAccount();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(false));
  }, []);

  const setSetting = <K extends keyof AppData['settings']>(k: K, v: AppData['settings'][K]) =>
    updateData((dd) => ({ ...dd, settings: { ...dd.settings, [k]: v } }));

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
        text: t('{f}, {c}. Die Daten auf diesem Gerät werden ersetzt.', {
          f: tn(backup.flights.length, 'Flug', 'Flüge'),
          c: tn(backup.cities.length, 'Stadt', 'Städte'),
        }),
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

  const exportCountries = () => {
    const rows = [...d.countries.values()]
      .filter((c) => c.visited || c.wish)
      .map((c) => [c.code, countryName(c.code), c.visited ? 'visited' : 'wishlist', c.first ?? '', c.last ?? '', c.trips.length, c.cities.length, data.countries[c.code]?.note ?? '']);
    downloadFile(`meridian-countries-${todayYmd()}.csv`, toCsv(['code', 'country', 'status', 'first_visit', 'last_visit', 'trips', 'cities', 'note'], rows), 'text/csv');
  };
  const exportCities = () => {
    const rows = data.cities.map((c) => [c.id, cityName(c), c.cc, c.pop, c.capital ? 1 : 0, c.visits.map((v) => v.date ?? '').join(' '), c.note ?? '']);
    downloadFile(`meridian-cities-${todayYmd()}.csv`, toCsv(['geonames_id', 'city', 'country', 'population', 'capital', 'visits', 'note'], rows), 'text/csv');
  };

  const wipe = async () => {
    // Mit Konto: erst per E-Mail bestätigen (löscht auch in der Cloud)
    if (acc.status === 'signedIn') {
      openConfirmByMail('wipe-data');
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

  const name = data.settings.name?.trim();
  const stats = [
    { v: d.visitedCount, l: tw(d.visitedCount, 'Land', 'Länder') },
    { v: data.cities.length, l: tw(data.cities.length, 'Stadt', 'Städte') },
    { v: d.trips.length, l: tw(d.trips.length, 'Trip', 'Trips') },
    { v: data.flights.length, l: tw(data.flights.length, 'Flug', 'Flüge') },
  ];

  return (
    <>
      <NavBar title={t('Profil')} />
      <LargeTitle>{t('Profil')}</LargeTitle>

      <button class="card press profile-head" style={{ '--press': '1.015' }} onClick={() => openSheet(() => <NameSheet />)}>
        <div class="avatar">{name ? name.slice(0, 1).toUpperCase() : flag(data.settings.home)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div class="pname">{name || t('Name hinzufügen')}</div>
          <div class="psub">
            {flag(data.settings.home)} {countryName(data.settings.home)}
          </div>
        </div>
        <Icon name="pencil" size={18} />
      </button>
      <div class="profile-stats stagger">
        {stats.map((s, i) => (
          <div class="stat" style={stagger(i)}>
            <div class="v">
              <AnimatedNumber value={s.v} />
            </div>
            <div class="l">{s.l}</div>
          </div>
        ))}
      </div>

      <AccountSection />

      <SectionTitle>{t('Darstellung')}</SectionTitle>
      <div style={{ margin: '0 16px' }}>
        <Segmented
          value={meta.theme}
          onChange={(v: Meta['theme']) => {
            switchTheme(v);
            updateMeta({ theme: v });
          }}
          options={[
            {
              value: 'system',
              label: (
                <span class="seg-ico">
                  <Icon name="monitor" size={16} /> {t('System')}
                </span>
              ),
            },
            {
              value: 'light',
              label: (
                <span class="seg-ico">
                  <Icon name="sun" size={16} /> {t('Hell')}
                </span>
              ),
            },
            {
              value: 'dark',
              label: (
                <span class="seg-ico">
                  <Icon name="moon" size={16} /> {t('Dunkel')}
                </span>
              ),
            },
          ]}
        />
      </div>

      <SectionTitle>{t('Sprache')}</SectionTitle>
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
            onClick={() => updateMeta({ lang: l.code as Lang })}
          />
        ))}
      </div>

      <SectionTitle>{t('Reisen')}</SectionTitle>
      <div class="list">
        <Row
          lead={flag(data.settings.home)}
          leadClass="flag"
          title={t('Heimatland')}
          sub={t('Trips beginnen und enden hier')}
          trail={countryName(data.settings.home)}
          chevron
          onClick={() => openSheet(() => <HomePicker />, { tall: true })}
        />
      </div>
      <SectionTitle>{t('Städte zählen ab')}</SectionTitle>
      <div class="chips" style={{ flexWrap: 'wrap' }}>
        {THRESHOLDS.map((v) => (
          <Chip on={data.settings.cityThreshold === v} onClick={() => setSetting('cityThreshold', v)}>
            {tn(v, 'Einwohner', 'Einwohner')}
          </Chip>
        ))}
      </div>
      <p class="hint">{t('Hauptstädte zählen immer. Bereits erfasste Städte bleiben erhalten.')}</p>
      <SectionTitle>{t('Umstieg statt Ziel, wenn kürzer als')}</SectionTitle>
      <div class="chips">
        {LAYOVERS.map((h) => (
          <Chip on={data.settings.layoverHours === h} onClick={() => setSetting('layoverHours', h)}>
            {tn(h, 'Stunde', 'Stunden')}
          </Chip>
        ))}
      </div>
      <p class="hint">{t('Touchdown zählt: Auch ein Land, in dem du nur umsteigst, gilt als besucht.')}</p>

      <SectionTitle>{t('Sicherung als Datei')}</SectionTitle>
      <div class="list">
        <Row
          lead={<Icon name="upload" />}
          title={t('Sicherung speichern (JSON)')}
          sub={t('Zuletzt {t}', { t: fmtAgo(meta.lastExportAt) })}
          trail={warn ? <span class="badge day">{t('empfohlen')}</span> : undefined}
          onClick={exportJson}
        />
        <Row lead={<Icon name="download" />} title={t('Sicherung einspielen')} onClick={() => fileInput.current?.click()} />
        <Row lead={<Icon name="flag" />} title={t('Länder als CSV')} onClick={exportCountries} />
        <Row lead={<Icon name="building" />} title={t('Städte als CSV')} onClick={exportCities} />
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => importJson((e.currentTarget as HTMLInputElement).files)} />

      <SectionTitle>{t('Daten')}</SectionTitle>
      <div class="list">
        <Row lead={<Icon name="plane" />} title={t('FlightVault importieren')} sub={`${tn(data.flights.length, 'Flug', 'Flüge')} · ${tn(data.fvTrips.length, 'Trip', 'Trips')}`} chevron onClick={openImport} />
        <Row lead={<Icon name="alert" />} title={t('Datencheck')} sub={d.issues.length ? tn(d.issues.length, 'Hinweis', 'Hinweise') : t('Alles sauber')} chevron onClick={openDataCheck} />
        <Row
          lead={<Icon name="shield" />}
          title={persisted ? t('Daten geschützt') : t('Nicht dauerhaft geschützt')}
          sub={persisted ? t('Der Browser löscht sie nicht bei Platzmangel') : t('Der Browser könnte Daten bei Platzmangel löschen')}
          trail={
            !persisted ? (
              <button
                class="btn small press"
                onClick={async () => {
                  const ok = await requestPersistence();
                  setPersisted(ok);
                  toast(ok ? t('Daten sind jetzt geschützt') : t('Der Browser hat abgelehnt – installiere die App'), !ok);
                }}
              >
                {t('Schützen')}
              </button>
            ) : undefined
          }
        />
      </div>

      <SectionTitle>{t('Über')}</SectionTitle>
      <div class="list plain">
        <div class="kv">
          <span class="k">{t('Version')}</span>
          <span class="v">Meridian {__APP_VERSION__}</span>
        </div>
      </div>
      <p class="hint" style={{ lineHeight: 1.6 }}>
        {t('Datenquellen')}: <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (CC BY 4.0),{' '}
        <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>,{' '}
        <a href="https://github.com/mledoze/countries" target="_blank" rel="noreferrer">mledoze/countries</a> (ODbL),{' '}
        <a href="https://github.com/mwgg/Airports" target="_blank" rel="noreferrer">mwgg/Airports</a> (MIT), Twemoji (CC BY 4.0).{' '}
        {t('Ohne Konto bleiben alle Daten auf deinem Gerät. Mit Konto werden sie verschlüsselt übertragen und bei Google Firebase in Zürich gespeichert.')}
      </p>

      <div style={{ margin: '24px 16px 0' }}>
        <button class="btn danger block press" onClick={wipe}>
          <Icon name="trash" /> {t('Alle Daten löschen')}
        </button>
      </div>
      <DeleteAccountButton />
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
        <label class="field">
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

export { fmtInt };
