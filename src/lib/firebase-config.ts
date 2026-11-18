// Öffentliche Web-Konfiguration des Firebase-Projekts.
// Diese Werte sind nicht geheim (sie stehen bei jeder Firebase-Web-App im Code);
// geschützt werden die Daten durch die Sicherheitsregeln in firestore.rules.
// Solange hier null steht, läuft Meridian ohne Konten (nur lokal).
export const firebaseConfig: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
} | null = null;
