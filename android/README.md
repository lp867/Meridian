# Meridian für Android

Die Android-App ist eine **Trusted Web Activity**: Sie öffnet `https://lp867.github.io/Meridian/`
in Chrome, aber im Vollbild ohne Adressleiste und mit eigenem Symbol. Inhalt und Updates kommen
immer von der Website. Eine neue APK braucht es nur, wenn sich an der App-Hülle etwas ändert
(Symbol, Farben, Paketname, Bibliothek).

Die App teilt sich den Speicher mit Chrome: Was in Chrome auf demselben Handy eingetragen ist,
ist in der App gleich dabei.

## Bauen

Voraussetzung: Android Studio (bringt Java und das Android-SDK mit).

```bash
npm run apk
```

Ergebnis: `android/build/Meridian.apk` (signiert). Vor einer neuen Version in
`app/build.gradle.kts` `versionCode` und `versionName` erhöhen.

## Veröffentlichen

Die Website verlinkt immer auf die neueste APK aus den GitHub-Releases
(`releases/latest/download/Meridian.apk`). Der Dateiname muss deshalb `Meridian.apk` bleiben:

```bash
gh release create android-1.1 android/build/Meridian.apk --title "Meridian für Android 1.1"
```

## Signaturschlüssel – wichtig

`meridian-release.jks` und `keystore.properties` liegen nur lokal in diesem Ordner und sind nicht
im Repo. **Beide sicher aufbewahren** (z. B. im Passwort-Manager oder auf einem USB-Stick).
Ohne denselben Schlüssel lässt sich die installierte App nicht mehr aktualisieren. Man müsste
sie dann deinstallieren und neu installieren.

## Vollbild-Bestätigung

Damit Chrome die Adressleiste ausblendet, muss die Website die App bestätigen:
`https://lp867.github.io/.well-known/assetlinks.json` im Repo
[lp867/lp867.github.io](https://github.com/lp867/lp867.github.io) enthält den SHA-256-Fingerabdruck
des Schlüssels. Kommt die App in den Play Store, gehört dort zusätzlich der Fingerabdruck von
Google Play dazu (Play Console → App-Integrität).

Fingerabdruck anzeigen:

```bash
keytool -list -v -keystore android/meridian-release.jks
```
