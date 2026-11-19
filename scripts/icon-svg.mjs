// Gemeinsame Bausteine des App-Icons (Globus auf dunklem Verlauf), Raster 512 × 512.

export const globe = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="150" fill="none" stroke="url(#g)" stroke-width="26"/>
    <ellipse cx="256" cy="256" rx="62" ry="150" fill="none" stroke="url(#g)" stroke-width="20"/>
    <path d="M106 256h300" stroke="url(#g)" stroke-width="20" stroke-linecap="round"/>
    <path d="M126 186h260M126 326h260" stroke="url(#g)" stroke-width="12" stroke-linecap="round" opacity=".55"/>
    <circle cx="318" cy="214" r="17" fill="#ffb43a"/>
  </g>`;

export const defs = `
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

export const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}${body}</svg>`;

/** Pfad einer file:-URL für sharp (unter Windows ohne führenden Schrägstrich). */
export const filePath = (url) => decodeURIComponent(url.pathname).replace(/^\/(\w:)/, '$1');
