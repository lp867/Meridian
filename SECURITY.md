# Sicherheit

Hast du eine Sicherheitslücke in Meridian gefunden? Bitte melde sie **nicht** als öffentliches Issue,
sondern vertraulich über **Security → Report a vulnerability** in diesem Repository.

## Schutzmassnahmen

- Content-Security-Policy: Skripte nur von der eigenen Adresse und Google (Anmeldung), Netzwerk nur zu Firebase.
- Einbetten in fremde Seiten wird blockiert.
- Firestore-Sicherheitsregeln (`firestore.rules`): Jede Person sieht nur ihre eigenen Daten, alle anderen Pfade sind gesperrt.
- Eingelesene Sicherungen und Cloud-Daten werden Feld für Feld geprüft.
- Konto und Daten lassen sich nur nach Bestätigung per E-Mail löschen.
- Build: gepinnte GitHub Actions, keine Installationsskripte, Signaturprüfung der Pakete, Dependabot.
