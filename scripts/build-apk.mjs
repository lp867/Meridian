// Baut die Android-App (signierte APK) lokal: npm run apk
// Braucht Android Studio (bringt Java und das Android-SDK mit) und den Signaturschlüssel
// android/meridian-release.jks + android/keystore.properties (beide nicht im Repo).
// Ergebnis: android/build/Meridian.apk – danach als GitHub-Release veröffentlichen (siehe android/README.md).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../android/', import.meta.url);
const dir = decodeURIComponent(root.pathname).replace(/^\/(\w:)/, '$1');
const win = process.platform === 'win32';

const fail = (msg) => {
  console.error(`\n${msg}\n`);
  process.exit(1);
};

// Java: aus JAVA_HOME oder das von Android Studio mitgelieferte
const studioJbr = win ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const javaHome = process.env.JAVA_HOME || (existsSync(studioJbr) ? studioJbr : null);
if (!javaHome) fail('Java nicht gefunden. Android Studio installieren oder JAVA_HOME setzen.');

// Android-SDK-Pfad für Gradle
if (!existsSync(join(dir, 'local.properties'))) {
  const sdk = process.env.ANDROID_HOME || (win ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : join(homedir(), 'Library/Android/sdk'));
  if (!existsSync(sdk)) fail('Android-SDK nicht gefunden. Android Studio einmal starten oder ANDROID_HOME setzen.');
  writeFileSync(join(dir, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/').replace(':', '\\:')}\n`);
}

if (!existsSync(join(dir, 'keystore.properties'))) {
  fail('Signaturschlüssel fehlt (android/keystore.properties). Ohne denselben Schlüssel lassen sich bestehende Installationen nicht aktualisieren.');
}

execFileSync(process.execPath, [decodeURIComponent(new URL('build-android-icons.mjs', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')], { stdio: 'inherit' });
execSync(`"${join(dir, win ? 'gradlew.bat' : 'gradlew')}" assembleRelease --console=plain -q`, {
  cwd: dir,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome },
});

const gradle = readFileSync(join(dir, 'app', 'build.gradle.kts'), 'utf8');
const version = gradle.match(/versionName = "([^"]+)"/)?.[1] ?? '?';
mkdirSync(join(dir, 'build'), { recursive: true });
const out = join(dir, 'build', 'Meridian.apk');
copyFileSync(join(dir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), out);
console.log(`\nAPK ${version} fertig: ${out}`);
console.log(`Veröffentlichen: gh release create android-${version} "${out}" --title "Meridian für Android ${version}"`);
