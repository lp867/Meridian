# Meridian

Reise-Tracker als Web-App: besuchte Länder, Städte, Trips und Flüge auf einer Karte. Läuft offline und lässt sich auf dem Handy installieren.

**App öffnen:** https://lp867.github.io/Meridian/

## Funktionen

- Weltkarte mit besuchten Ländern, Wunschliste und Städten
- Länderliste, Städte (ab einer einstellbaren Einwohnerzahl, Hauptstädte immer) und Ziele
- Trips entstehen automatisch aus Flügen; Tagesausflüge, Umstiege und Bodenstrecken werden erkannt
- Flugliste, Statistik, Routenkarte und Flugzeug-Sammlung
- Import von FlightVault-Exporten (CSV)
- Optionales Konto (E-Mail oder Google) mit Synchronisierung zwischen Geräten
- Deutsch, Englisch, Französisch und Spanisch; heller und dunkler Modus

## Datenschutz

Ohne Konto bleiben alle Daten im Browser auf deinem Gerät. Mit einem (kostenlosen) Konto werden sie verschlüsselt
übertragen und bei Google Firebase in Zürich (europe-west6) gespeichert, damit sie auf allen Geräten verfügbar sind.
Jede Person kann nur ihre eigenen Daten lesen (siehe `firestore.rules`). Konto und Cloud-Daten lassen sich in der App
jederzeit löschen.

## Installieren

Seite in Chrome (Android) öffnen → Menü → «Zum Startbildschirm hinzufügen» bzw. «App installieren».

Für Android gibt es zusätzlich eine APK (Profil → Über → Android-App, oder direkt
[Meridian.apk](https://github.com/lp867/Meridian/releases/latest/download/Meridian.apk)). Bauen und
veröffentlichen: siehe [android/README.md](android/README.md).

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Produktions-Build nach dist/
```

Jeder Push auf `main` wird über GitHub Actions automatisch auf GitHub Pages veröffentlicht.

Die Geodaten in `public/data/` werden mit `scripts/build-data.mjs` aus den unten genannten Quellen erzeugt
(Aufruf und benötigte Dateien stehen im Skript).

## Datenquellen

- Städte: [GeoNames](https://www.geonames.org/) (CC BY 4.0)
- Weltkarte: [Natural Earth](https://www.naturalearthdata.com/) über [world-atlas](https://github.com/topojson/world-atlas)
- Länder: [mledoze/countries](https://github.com/mledoze/countries) (ODbL)
- Flughäfen: [mwgg/Airports](https://github.com/mwgg/Airports) (MIT)
- Flaggen unter Windows: [Twemoji](https://github.com/twitter/twemoji) (CC BY 4.0)
