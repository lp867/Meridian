// Erzeugt die App-Icons (SVG + PNG) für die PWA.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const globe = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="150" fill="none" stroke="url(#g)" stroke-width="26"/>
    <ellipse cx="256" cy="256" rx="62" ry="150" fill="none" stroke="url(#g)" stroke-width="20"/>
    <path d="M106 256h300" stroke="url(#g)" stroke-width="20" stroke-linecap="round"/>
    <path d="M126 186h260M126 326h260" stroke="url(#g)" stroke-width="12" stroke-linecap="round" opacity=".55"/>
    <circle cx="318" cy="214" r="17" fill="#ffb43a"/>
  </g>`;

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2029"/>
      <stop offset="1" stop-color="#0a0c10"/>
    </linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8cc2ff"/>
      <stop offset="1" stop-color="#2f7ff0"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/>
      <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" rx="116" fill="url(#bg)"/>
  <rect x="3" y="3" width="506" height="506" rx="113" fill="none" stroke="url(#rim)" stroke-width="6"/>
  ${globe(1)}
</svg>`;

// Maskable: Vollfläche, Motiv in der sicheren Zone
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="url(#bg)"/>
  ${globe(0.78)}
</svg>`;

writeFileSync(new URL('icon.svg', OUT), rounded);
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile(new URL('icon-192.png', OUT).pathname.replace(/^\/(\w:)/, '$1'));
await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile(new URL('icon-512.png', OUT).pathname.replace(/^\/(\w:)/, '$1'));
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(new URL('icon-maskable-512.png', OUT).pathname.replace(/^\/(\w:)/, '$1'));
console.log('Icons erstellt');
