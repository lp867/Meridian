# Sicherheit

Hast du eine Sicherheitslücke in Meridian gefunden? Bitte melde sie **nicht** als öffentliches Issue,
sondern vertraulich über **Security → Report a vulnerability** in diesem Repository.

## Schutzmassnahmen

- Content-Security-Policy: Skripte nur von der eigenen Adresse und Google (Anmeldung), Netzwerk nur zu Firebase.
- Einbetten in fremde Seiten wird blockiert.
- Firestore-Sicherheitsregeln (`firestore.rules`): Jede Person sieht nur ihre eigenen Daten, alle anderen Pfade sind gesperrt.
- Eingelesene Sicherungen, FlightVault-CSVs und Cloud-Daten werden Feld für Feld geprüft.
  Dateien müssen vorher Typ (Endung oder MIME-Typ), Grösse (CSV 20 MB, Sicherung 50 MB) und
  Textprüfung bestehen.
- Nutzertexte werden nie als HTML eingefügt (Preact escaped sie). CSV-Exporte entschärfen Formeln (`=`, `+`, `-`, `@`).
- Neue Konten brauchen ein Passwort mit mindestens 8 Zeichen. Gegen Durchprobieren schützt Firebase
  serverseitig (Sperre nach zu vielen Versuchen), der Schutz vor E-Mail-Ausspähung ist aktiv.
- Keine Rollen oder Admin-Bereiche: Die Regeln erlauben im eigenen Dokument nur die Felder `data`, `updatedAt` und `version`.
- Keine Geheimnisse im Repo: Der Firebase-Web-Schlüssel ist öffentlich vorgesehen. `.env`-Dateien und der
  Android-Signaturschlüssel sind ausgeschlossen, und GitHub blockiert Pushes mit erkannten Geheimnissen.
- Konto und Daten lassen sich nur nach Bestätigung per E-Mail löschen.
- Build: gepinnte GitHub Actions, keine Installationsskripte, Signaturprüfung der Pakete, Dependabot.
