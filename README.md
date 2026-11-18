# Meridian

Reise-Tracker als Web-App: besuchte Länder, Städte, Trips und Flüge auf einer Karte. Läuft offline und lässt sich auf dem Handy installieren.

**App öffnen:** https://lp867.github.io/Meridian_Webapp/

## Funktionen

- Weltkarte mit besuchten Ländern, Wunschliste und Städten
- Länderliste, Städte (ab einer einstellbaren Einwohnerzahl, Hauptstädte immer) und Ziele
- Trips entstehen automatisch aus Flügen; Tagesausflüge, Umstiege und Bodenstrecken werden erkannt
- Flugliste, Statistik, Routenkarte und Flugzeug-Sammlung
- Import von FlightVault-Exporten (CSV)
- Deutsch, Englisch, Französisch und Spanisch; heller und dunkler Modus

## Datenschutz

Alle Daten bleiben im Browser auf deinem Gerät. Die App hat keinen Server und schickt nichts weg.
Optional kann sie deine Daten als Datei in ein **eigenes, privates** GitHub-Repo sichern (in öffentliche Repos sichert sie aus Datenschutzgründen nicht). Dafür braucht es einen
Fine-grained Token, der nur Zugriff auf dieses eine Repo hat (Contents: Read and write). Der Token bleibt auf dem Gerät
und ist nie Teil einer Sicherung.

## Installieren

Seite in Chrome (Android) öffnen → Menü → «Zum Startbildschirm hinzufügen» bzw. «App installieren».

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
