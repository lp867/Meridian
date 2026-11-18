// Öffentliche Web-Konfiguration des Firebase-Projekts.
// Diese Werte sind nicht geheim (sie stehen bei jeder Firebase-Web-App im Code);
// geschützt werden die Daten durch die Sicherheitsregeln in firestore.rules.
// Steht hier null, läuft Meridian ohne Konten (nur lokal).
export const firebaseConfig: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
} | null = {
  apiKey: 'AIzaSyC8qftkto83TCQKrj7bphaeRhqJYDJSiLY',
  authDomain: 'meridian-2da23.firebaseapp.com',
  projectId: 'meridian-2da23',
  storageBucket: 'meridian-2da23.firebasestorage.app',
  messagingSenderId: '157432996922',
  appId: '1:157432996922:web:13fc8a8f715928e2c94103',
};

// Firebase App Check mit reCAPTCHA Enterprise: lässt nur Anfragen aus der echten Meridian-App zu
// (Skripte und Bots mit dem öffentlichen API-Schlüssel werden abgewiesen).
// Den Websiteschlüssel (öffentlich) hier eintragen, sobald er in der Google Cloud angelegt ist.
export const appCheckSiteKey = '';
