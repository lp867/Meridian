// Erzeugt die App-Icons (SVG + PNG) für die PWA.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { filePath, globe, svg } from './icon-svg.mjs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const rounded = svg(`
  <rect width="512" height="512" rx="116" fill="url(#bg)"/>
  <rect x="3" y="3" width="506" height="506" rx="113" fill="none" stroke="url(#rim)" stroke-width="6"/>
  ${globe(1)}
`);

// Maskable: Vollfläche, Motiv in der sicheren Zone
const maskable = svg(`
  <rect width="512" height="512" fill="url(#bg)"/>
  ${globe(0.78)}
`);

writeFileSync(new URL('icon.svg', OUT), rounded);
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile(filePath(new URL('icon-192.png', OUT)));
await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile(filePath(new URL('icon-512.png', OUT)));
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(filePath(new URL('icon-maskable-512.png', OUT)));
console.log('Icons erstellt');
