// Erzeugt die Icons und das Startbild der Android-App (android/app/src/main/res).
// Adaptives Icon: Ebenen von 108 dp, davon sind die mittleren 72 dp sichtbar.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { filePath, globe, svg } from './icon-svg.mjs';

const RES = new URL('../android/app/src/main/res/', import.meta.url);
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const background = svg(`<rect width="512" height="512" fill="url(#bg)"/>`);
const foreground = svg(globe(0.61));
// Einfarbig für «Designsymbole» ab Android 13: das System färbt die Fläche selbst ein
const monochrome = svg(globe(0.61))
  .replace(/url\(#g\)/g, '#fff')
  .replace('fill="#ffb43a"', 'fill="#fff"');
// Startbild: Globus mittig auf 300 dp, auf dem App-Hintergrund
const splash = svg(globe(0.58));

const png = async (src, dir, name, px) => {
  const out = new URL(`${dir}/`, RES);
  mkdirSync(out, { recursive: true });
  await sharp(Buffer.from(src), { density: 72 * (px / 512) * 4 })
    .resize(px, px)
    .png({ compressionLevel: 9 })
    .toFile(filePath(new URL(`${name}.png`, out)));
};

for (const [dpi, f] of Object.entries(DENSITIES)) {
  const layer = Math.round(108 * f);
  await png(background, `mipmap-${dpi}`, 'ic_launcher_background', layer);
  await png(foreground, `mipmap-${dpi}`, 'ic_launcher_foreground', layer);
  await png(monochrome, `mipmap-${dpi}`, 'ic_launcher_monochrome', layer);
  await png(splash, `drawable-${dpi}`, 'splash', Math.round(300 * f));
}
console.log('Android-Icons erstellt');
